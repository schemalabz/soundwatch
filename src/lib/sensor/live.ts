import { BAND_LABELS } from "../../../mqtt-ingester/flavor2";
import type { ApiReading } from "@/lib/api/schemas";
import { describeLevel, isLmaxLowerBound, type LevelBound } from "@/lib/api/levels";
import { fmtDb } from "@/lib/dashboard/format";
import { ATHENS_TZ } from "@/lib/dashboard/time";

// Everything the sensor page derives from its readings, as pure functions,
// so vitest can reach it (components are .tsx and outside the test include).

// --- merging ------------------------------------------------------------

/**
 * Union by recordedAt (a replay replaces its copy), newest receivedAt first.
 * Keyed on recordedAt: (sensorId, recordedAt) is the readings primary key, so
 * it is unique per sensor by construction; receivedAt is a millisecond
 * default with no uniqueness and can collide in a backlog burst.
 */
export function mergeReadings(existing: ApiReading[], incoming: ApiReading[]): ApiReading[] {
  const byKey = new Map<string, ApiReading>();
  for (const r of existing) byKey.set(r.recordedAt, r);
  for (const r of incoming) byKey.set(r.recordedAt, r);
  return [...byKey.values()].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : 0));
}

/**
 * Keep the readings that ARRIVED within the window. Filtering on receivedAt,
 * not recordedAt, is the whole point: 28.65% of production rows arrive after
 * their device stamp (store-and-forward replay, lagging clocks), so a
 * recordedAt filter drops rows that just landed. receivedAt is also what
 * mergeReadings sorts by and what liveStatus ages, so one clock governs
 * ordering, age and membership.
 */
export function trimToWindow(readings: ApiReading[], floorMs: number): ApiReading[] {
  const floor = new Date(floorMs).toISOString();
  return readings.filter((r) => r.receivedAt >= floor);
}

/** Device clock minus server clock, seconds. Positive = device runs ahead. */
export function clockOffsetS(r: ApiReading): number {
  return Math.round((Date.parse(r.recordedAt) - Date.parse(r.receivedAt)) / 1000);
}

/** Median gap between arrivals over the newest 10 rows; the configured interval when there is nothing to measure. */
export function observedCadenceS(readings: ApiReading[], fallbackS: number): number {
  const times = readings.slice(0, 10).map((r) => Date.parse(r.receivedAt));
  if (times.length < 2) return fallbackS;
  const gaps = times.slice(1).map((t, i) => (times[i] - t) / 1000).sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
}

// --- focus navigation ---------------------------------------------------

/** One step through the log: `older` goes back in time, `newer` forward. */
export type FocusStep = "older" | "newer";

export interface FocusNav {
  /** Position of the interval in focus, 0 = newest. -1 when the window is empty. */
  index: number;
  total: number;
  /** focusKey for the interval one step older, or null when there is none. */
  older: string | null;
  /**
   * focusKey for the interval one step newer. null means the newest row, which
   * the page expresses as live (focusKey = null) rather than as a pinned key —
   * so null is a legitimate destination here, and `hasNewer` is what says
   * whether the step exists at all.
   */
  newer: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

/**
 * Where the previous/next controls should go from the interval in focus.
 *
 * `readings` is newest-first (the order the log renders), so "older" moves
 * down the array. A focusKey that is not in the window — the sensor's last
 * known interval shown beside an empty window — is treated as the newest, the
 * same fallback SensorLivePage uses when it resolves `focused`.
 */
export function focusNav(readings: ApiReading[], focusKey: string | null): FocusNav {
  const total = readings.length;
  if (total === 0) return { index: -1, total: 0, older: null, newer: null, hasOlder: false, hasNewer: false };

  const found = focusKey == null ? 0 : readings.findIndex((r) => r.recordedAt === focusKey);
  const index = found === -1 ? 0 : found;

  const hasOlder = index < total - 1;
  const hasNewer = index > 0;
  return {
    index,
    total,
    hasOlder,
    hasNewer,
    older: hasOlder ? readings[index + 1].recordedAt : null,
    // Stepping onto the newest row returns to live rather than pinning it,
    // so the page keeps following new intervals as they arrive.
    newer: hasNewer && index - 1 > 0 ? readings[index - 1].recordedAt : null,
  };
}

// --- formatting ---------------------------------------------------------

const clock = new Intl.DateTimeFormat("el-GR", {
  timeZone: ATHENS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function fmtClock(iso: string): string {
  return clock.format(new Date(iso)).padStart(8, "0");
}

export interface FormattedLevel {
  text: string;
  bound: LevelBound;
}

/** A percentile with the "≥ 88" rule applied and a Greek decimal comma. */
export function fmtLevel(
  value: number | null | undefined,
  r: Pick<ApiReading, "topBinCensored" | "bottomBinCensored">
): FormattedLevel {
  const d = describeLevel(value, { topBinCensored: r.topBinCensored, bottomBinCensored: r.bottomBinCensored });
  if (d.value == null) return { text: "—", bound: null };
  const prefix = d.bound === "lower" ? "≥ " : d.bound === "upper" ? "≤ " : "";
  return { text: `${prefix}${fmtDb(d.value)}`, bound: d.bound };
}

/** lmax_est is a lower bound whenever the interval put frames in the open top bin. */
export function fmtLmax(r: ApiReading): { text: string; bound: "lower" | null } {
  if (r.lmaxEst == null) return { text: "—", bound: null };
  const lower = isLmaxLowerBound(r);
  return { text: `${lower ? "≥ " : ""}${fmtDb(r.lmaxEst)}`, bound: lower ? "lower" : null };
}

/** "—" for null, else the value with one decimal and a Greek comma. */
export function fmtOptionalDb(v: number | null | undefined): string {
  return v == null ? "—" : fmtDb(v);
}

/** realized_duty (0..1) as a percentage: 28,8 % · "—" for null. */
export function fmtDuty(duty: number | null | undefined): string {
  return duty == null ? "—" : `${fmtDb(duty * 100)} %`;
}

/** Below this share of the interval analysed, the interval is incomplete and its levels are not to be trusted. */
export const LOW_COVERAGE = 0.05;
export function isLowCoverage(duty: number | null | undefined): boolean {
  return duty != null && duty < LOW_COVERAGE;
}

/**
 * Did the meter clip during this interval? Takes the READING, not the count,
 * so the null handling cannot be re-decided at a call site: schemas.ts says a
 * null energySaturations means firmware too old to report the counter, which
 * is NOT "zero saturations" — it is "unknown", and unknown must not raise the
 * warning mark.
 */
export function isSaturated(r: Pick<ApiReading, "energySaturations">): boolean {
  return (r.energySaturations ?? 0) > 0;
}

// --- spectrum -----------------------------------------------------------

// The scale a bar chart actually uses is derived from the window by
// spectrumScale below, so consecutive intervals stay comparable by eye even
// though un-weighted bands run anywhere from ~35 (quiet room) to ~115
// (street). These two constants are only the fallback for when a window
// carries no bands at all (spectrumScale returns them, unchanged).
export const SPECTRUM_MIN_DB = 85;
export const SPECTRUM_MAX_DB = 120;
export interface SpectrumScale {
  min: number;
  max: number;
}
/** The narrowest scale a bar chart may use; narrower and every bar looks the same. */
export const SPECTRUM_MIN_SPAN_DB = 30;

/**
 * A scale that fits every band in the window, padded by 5 dB and snapped to
 * multiples of 5, never narrower than SPECTRUM_MIN_SPAN_DB. Bands are
 * un-weighted device-dB and sit anywhere from ~35 (quiet room) to ~115 (street),
 * so a fixed scale cannot serve both. With no bands at all: the fallback.
 */
export function spectrumScale(readings: ApiReading[]): SpectrumScale {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of readings) {
    for (const v of r.bandsDb ?? []) {
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) return { min: SPECTRUM_MIN_DB, max: SPECTRUM_MAX_DB };
  let min = Math.floor(lo / 5) * 5 - 5;
  let max = Math.ceil(hi / 5) * 5 + 5;
  if (max - min < SPECTRUM_MIN_SPAN_DB) {
    const pad = Math.ceil((SPECTRUM_MIN_SPAN_DB - (max - min)) / 2 / 5) * 5;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

/** Display labels: LOW, 250 … 800, 1k, 1,25k … 20k (Greek decimal comma). */
export const SPECTRUM_LABELS: string[] = BAND_LABELS.map((b) => {
  if (b === "low") return "LOW";
  const hz = Number(b);
  if (hz < 1000) return b;
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toString().replace(".", ",")}k`;
});

export interface SpectrumBar {
  label: string;
  value: number | null;
  /** 0..1 on the fixed scale. */
  height: number;
}

export function spectrumBars(
  bands: (number | null)[] | null,
  scale: SpectrumScale = { min: SPECTRUM_MIN_DB, max: SPECTRUM_MAX_DB }
): SpectrumBar[] {
  if (!bands) return [];
  return SPECTRUM_LABELS.map((label, i) => {
    const value = bands[i] ?? null;
    const height = value == null ? 0 : Math.max(0, Math.min(1, (value - scale.min) / (scale.max - scale.min)));
    return { label, value, height };
  });
}

/** Y-axis ticks for a spectrum scale: every 10 dB from the first multiple of 10 at or above min, up to max. */
export function spectrumTicks(scale: SpectrumScale): number[] {
  const ticks: number[] = [];
  for (let v = Math.ceil(scale.min / 10) * 10; v <= scale.max; v += 10) ticks.push(v);
  return ticks;
}

/** Human range of a band: "86–258 Hz" for LOW, third-octave edges (centre × 2^(±1/6)) for the rest, in Hz below 1 kHz and kHz above. */
export function bandRangeLabel(index: number): string {
  if (index === 0) return "86–258 Hz";
  const centre = Number(BAND_LABELS[index]);
  const lo = centre / Math.pow(2, 1 / 6);
  const hi = centre * Math.pow(2, 1 / 6);
  const f = (hz: number) => (hz >= 1000 ? `${fmtDb(hz / 1000).replace(/,0$/, "")} kHz` : `${Math.round(hz)} Hz`);
  return `${f(lo)}–${f(hi)}`;
}

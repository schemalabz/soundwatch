import {
  BAND_LABELS,
  HIST_BIN_DB,
  HIST_BINS,
  HIST_MIN_DB,
} from "../../../mqtt-ingester/flavor2";
import { describeLevel } from "./levels";
import { READING_COLUMNS } from "./readings";
import type { ApiReading } from "./schemas";

// CSV view of the readings the JSON route already serialises — built from the
// SAME ApiReading objects, so the two formats cannot disagree about a value.
// One row per interval, oldest first (a log reads downwards), decimal point,
// ISO 8601 UTC timestamps, empty cell for null. The 21 bands and the 30
// histogram bins are expanded into columns because the histogram is the only
// way to recompute a true percentile for a loud interval.

type Getter = (r: ApiReading) => unknown;

/** "", "lower" or "upper" — describeLevel's verdict, as a cell. */
function bound(value: number | null, r: ApiReading): string {
  return describeLevel(value, r).bound ?? "";
}

const FLAT: [string, Getter][] = [
  [READING_COLUMNS.recordedAt, (r) => r.recordedAt],
  [READING_COLUMNS.receivedAt, (r) => r.receivedAt],
  [READING_COLUMNS.laeq, (r) => r.laeq],
  [READING_COLUMNS.l10, (r) => r.l10],
  [READING_COLUMNS.l50, (r) => r.l50],
  [READING_COLUMNS.l90, (r) => r.l90],
  // Beside each percentile, the conclusion about it: "" (exact), "lower" (the
  // true value is at least this) or "upper". top_bin_censored below answers a
  // DIFFERENT question — whether the interval put any frame in the open-ended
  // top bin — and is true far more often than a percentile is actually
  // censored, so a reader who treats it as "this number is a floor" is wrong
  // most of the time. describeLevel is the rule; here it becomes a column.
  ["l10_bound", (r) => bound(r.l10, r)],
  ["l50_bound", (r) => bound(r.l50, r)],
  ["l90_bound", (r) => bound(r.l90, r)],
  ["top_bin_censored", (r) => r.topBinCensored],
  ["bottom_bin_censored", (r) => r.bottomBinCensored],
  [READING_COLUMNS.lmaxEst, (r) => r.lmaxEst],
  [READING_COLUMNS.lminEst, (r) => r.lminEst],
  [READING_COLUMNS.realizedDuty, (r) => r.realizedDuty],
  [READING_COLUMNS.frameCount, (r) => r.frameCount],
  [READING_COLUMNS.intervalMs, (r) => r.intervalMs],
  [READING_COLUMNS.energySaturations, (r) => r.energySaturations],
  [READING_COLUMNS.payloadVersion, (r) => r.payloadVersion],
  [READING_COLUMNS.temperature, (r) => r.temperature],
  [READING_COLUMNS.humidity, (r) => r.humidity],
  [READING_COLUMNS.pressurePa, (r) => r.pressurePa],
  [READING_COLUMNS.battery, (r) => r.battery],
  [READING_COLUMNS.rssi, (r) => r.rssi],
];

const BAND_COLUMNS = BAND_LABELS.map((b) => `band_${b}`);
const HIST_COLUMNS = Array.from({ length: HIST_BINS }, (_, i) => `hist_${HIST_MIN_DB + i * HIST_BIN_DB}`);

export const CSV_HEADER: string[] = [...FLAT.map(([name]) => name), ...BAND_COLUMNS, ...HIST_COLUMNS];

function cell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function readingsToCsv(readings: ApiReading[]): string {
  const rows = [...readings].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0));
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    const bands = r.bandsDb ?? [];
    const hist = r.hist ?? [];
    lines.push(
      [
        ...FLAT.map(([, get]) => cell(get(r))),
        ...BAND_COLUMNS.map((_, i) => cell(bands[i])),
        ...HIST_COLUMNS.map((_, i) => cell(hist[i])),
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}

/** "2026-09-22T06:29:39.000Z" -> "20260922T0629"; undefined -> the fallback. */
function compact(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString().replace(/[-:]/g, "").slice(0, 13);
}

/**
 * A sensor name is free text an admin types, and the slug goes into TWO
 * Content-Disposition forms — the ASCII `filename=` and the percent-encoded
 * `filename*=`, where one Greek character costs nine bytes. Uncapped, a
 * 5,000-character name produced a 30,426-byte header set; a reverse proxy
 * with the usual 4-8 KB header buffer answers that with a 502, so the
 * download fails for a name that is merely silly rather than hostile.
 *
 * 60 characters is past any real store name and leaves the whole header
 * comfortably inside one buffer. The trailing `-` a cut can leave is trimmed
 * after the cut, not before.
 */
const MAX_SLUG_CHARS = 60;

/** Cut by code point, not by UTF-16 unit: half a surrogate pair would make
 *  encodeURIComponent throw where the uncapped name merely made a long name. */
function truncate(s: string, max: number): string {
  return [...s].slice(0, max).join("");
}

export function csvFilename(name: string | null, id: string, from?: string, to?: string): string {
  const slug = truncate(
    (name ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-"),
    MAX_SLUG_CHARS
  ).replace(/^-|-$/g, "");
  return `soundwatch-${slug || id.slice(0, 8)}-${compact(from, "start")}-${compact(to, "now")}.csv`;
}

// «Σε σχέση με το συνηθισμένο» — the rule, client-safe.
//
// The usual for a sensor at an instant is the L90–L10 band of the SAME Athens
// clock hour on the SAME kind of day (weekday / weekend) over the previous
// USUAL_WEEKS weeks, excluding the Athens day of the instant itself. A figure
// outside that band is a departure.
//
// Two references, stated once here and nowhere else: the pill FIRES on the
// band edge (outside L90–L10), and the number it carries is the distance from
// the typical hour, round(level − L50). The pane shows both, so a reader can
// see why a +3 reads as usual at one place and as a departure at another —
// the band is the site's own spread.
//
// Why support is counted in hour-buckets, not readings: the simulator runs at
// 60 s and the fleet at ~27 s, so a reading count means different things on
// the two stacks; a bucket is an hour of presence on either. Below the
// threshold no band exists and the client says «χωρίς αρκετό ιστορικό» —
// which is exactly how the first mock manufactured a +8 dB departure from a
// three-day, weekend-heavy baseline.
//
// The SQL that computes bands, and the departure episodes, live in
// src/lib/server/usual.ts; this module has no server imports so the map can
// use the rule in the browser.

import { athensDateStartMs, athensWallTime } from "@/lib/dashboard/time";
import type { DayType, UsualBand } from "@/lib/api/dashboard";

export const USUAL_WEEKS = 4;
export const USUAL_DAYS = USUAL_WEEKS * 7;
/** Hour-buckets a clock hour needs before its band is drawn — of at most 20
 *  weekday or 8 weekend buckets in four weeks. */
export const USUAL_MIN_BUCKETS = 6;
/**
 * The band is never narrower than L50 ± this. A site whose four-week spread at
 * an hour is 2 dB (the simulator's regular days; a quiet courtyard) would
 * otherwise flag every wobble, and a 1-dB excursion is below what the level
 * ramp itself distinguishes. Production bands are 10–12 dB wide, so there the
 * floor never binds.
 */
export const USUAL_MIN_HALF_WIDTH_DB = 3;

const DAY_MS = 86_400_000;

export function dayTypeOf(epochMs: number): DayType {
  const { dow } = athensWallTime(epochMs);
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

export interface UsualWindow {
  /** Athens clock hour of the instant, 0–23. */
  hour: number;
  dayType: DayType;
  /** Athens midnight starting the instant's day: the band ends here. */
  dayStartMs: number;
  /** USUAL_DAYS before dayStartMs: the band starts here. */
  fromMs: number;
}

export function usualWindow(atMs: number): UsualWindow {
  const w = athensWallTime(atMs);
  const dayStartMs = athensDateStartMs(w.year, w.month, w.day);
  return { hour: w.hour, dayType: dayTypeOf(atMs), dayStartMs, fromMs: dayStartMs - USUAL_DAYS * DAY_MS };
}

export type UsualVerdict = "above" | "inside" | "below";

/** The band as drawn and judged: L90–L10, widened to the floor around L50. */
export function usualEdges(band: Pick<UsualBand, "l90" | "l50" | "l10">): { lo: number; hi: number } {
  return {
    lo: Math.min(band.l90, band.l50 - USUAL_MIN_HALF_WIDTH_DB),
    hi: Math.max(band.l10, band.l50 + USUAL_MIN_HALF_WIDTH_DB),
  };
}

/** The band edge is the rule; a figure exactly on it is inside. */
export function classify(level: number, band: Pick<UsualBand, "l90" | "l50" | "l10">): UsualVerdict {
  const { lo, hi } = usualEdges(band);
  if (level > hi) return "above";
  if (level < lo) return "below";
  return "inside";
}

/** The number on the pill: distance from the typical hour, whole dB. */
export function usualDelta(level: number, band: Pick<UsualBand, "l50">): number {
  return Math.round(level - band.l50);
}

/** Enough history to draw a band at all. */
export function hasSupport(band: Pick<UsualBand, "buckets"> | null | undefined): band is UsualBand {
  return band != null && band.buckets >= USUAL_MIN_BUCKETS;
}

/** "+10" / "−4": the pill's text. A real minus sign, as the rest of the UI prints. */
export function fmtDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "0";
}

export interface UsualCounts {
  /** Sensors with a value in the frame. */
  measured: number;
  above: number;
  below: number;
  inside: number;
  /** Measured, but no band for this hour yet. */
  noHistory: number;
}

/**
 * How a frame's places compare with their usual — the rail's line and the
 * mobile badge read the same numbers. Only sensors in `ids` count, so a
 * location filter or an unsited unit never inflates them.
 */
export function countVersusUsual(
  ids: readonly string[],
  frame: Record<string, { laeq: number }> | null,
  usual: Record<string, UsualBand> | null
): UsualCounts {
  const out: UsualCounts = { measured: 0, above: 0, below: 0, inside: 0, noHistory: 0 };
  for (const id of ids) {
    const v = frame?.[id];
    if (!v) continue;
    out.measured++;
    const band = usual?.[id];
    if (!hasSupport(band)) {
      out.noHistory++;
      continue;
    }
    out[classify(v.laeq, band)]++;
  }
  return out;
}

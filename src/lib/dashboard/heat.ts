// The heatmap's colour: a sequential ramp, light for the quiet end and the
// site's loud orange for the loud end, STRETCHED over the range of the grid
// it colours.
//
// Why not levelColor, the ramp the circles use: that one is anchored to fixed
// device-dB (45 / 68 / 90) so a circle means the same thing at any moment. A
// place's week lives inside ten or fifteen of those dB, so on the fixed ramp
// every cell is the same orange and the grid shows nothing. A heatmap exists
// to show the PATTERN, so its ramp spans its own data, and its legend prints
// the two ends in numbers so the stretch is never mistaken for an absolute.

export type Rgb = [number, number, number];

export interface HeatScale {
  lo: number;
  hi: number;
}

/** A range narrower than this is noise drawn as contrast: widen it. */
export const MIN_HEAT_SPAN_DB = 4;

/** The range to stretch over: the values' own min and max, widened around
 *  their middle when they sit closer together than MIN_HEAT_SPAN_DB. */
export function heatScale(values: Iterable<number | null | undefined>): HeatScale | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return null;
  if (hi - lo < MIN_HEAT_SPAN_DB) {
    const mid = (lo + hi) / 2;
    lo = mid - MIN_HEAT_SPAN_DB / 2;
    hi = mid + MIN_HEAT_SPAN_DB / 2;
  }
  return { lo, hi };
}

// Paper warmed toward the accent, the accent, the loud end. The first stop is
// not white: an empty cell (no data) must stay distinguishable from a quiet one.
export const HEAT_STOPS: Rgb[] = [
  [253, 240, 224],
  [246, 139, 36],
  [196, 52, 8],
];

/** Colour for a value on a scale; clamps outside it. */
export function heatColor(v: number, scale: HeatScale, stops: Rgb[] = HEAT_STOPS): string {
  const f = Math.min(1, Math.max(0, (v - scale.lo) / (scale.hi - scale.lo)));
  const pos = f * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const t = pos - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function heatGradient(stops: Rgb[] = HEAT_STOPS): string {
  return `linear-gradient(to right, ${stops.map((c) => `rgb(${c.join(",")})`).join(", ")})`;
}

/** Key of one cell of the week: dow (0 = Sunday) * 24 + clock hour. */
export function dowHourKey(dow: number, hour: number): number {
  return dow * 24 + hour;
}

// The radial charts' dB axis: the ring's domain and grid. Pure, tested;
// the drawing is in components/dashboard/charts/RadialChart.tsx.

// A flat day stays visibly flat: the ring never represents less than this
// many dB, so a 1 dB spread draws as a sliver of difference, not a cliff.
const RANGE_MIN_SPAN_DB = 6;

/** The ring's dB domain: the slices' own range, whole dB, at least the minimum span. */
export function radialDomain(values: number[]): { lo: number; hi: number } {
  if (values.length === 0) return { lo: 0, hi: RANGE_MIN_SPAN_DB };
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < RANGE_MIN_SPAN_DB) {
    const mid = (lo + hi) / 2;
    lo = mid - RANGE_MIN_SPAN_DB / 2;
    hi = mid + RANGE_MIN_SPAN_DB / 2;
  }
  return { lo: Math.floor(lo - 0.5), hi: Math.ceil(hi + 0.5) };
}

/** Whole-dB grid levels strictly inside the domain, at a step that gives 2–4 rings. */
export function radialGrid(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span <= 9 ? 2 : span <= 20 ? 5 : 10;
  const out: number[] = [];
  for (let g = Math.ceil(lo / step) * step; g < hi; g += step) if (g > lo) out.push(g);
  return out;
}

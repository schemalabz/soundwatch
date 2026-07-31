// Index color scale (low → high) used across the dashboard visuals.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [91, 168, 52]], // green  — low
  [0.25, [148, 193, 61]],
  [0.45, [199, 196, 60]],
  [0.65, [232, 179, 53]],
  [0.82, [236, 131, 44]],
  [1.0, [214, 52, 42]], // red    — high
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Maps t∈[0,1] (low→high) to an rgb() string on the index scale. */
export function scaleColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (x <= t1) {
      const f = (x - t0) / (t1 - t0 || 1);
      const r = Math.round(lerp(c0[0], c1[0], f));
      const g = Math.round(lerp(c0[1], c1[1], f));
      const b = Math.round(lerp(c0[2], c1[2], f));
      return `rgb(${r},${g},${b})`;
    }
  }
  const last = STOPS[STOPS.length - 1][1];
  return `rgb(${last[0]},${last[1]},${last[2]})`;
}

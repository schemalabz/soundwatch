// dB level -> visual encoding for the sensor circles: color ramps through
// the palette's quiet/sound/loud stops, size scales with level. Pure math
// with injectable stops (tested); the CSS-variable reader lives at the edge.

export interface LevelStops {
  /** [dB, [r, g, b]] color stops, ascending. */
  colors: [number, [number, number, number]][];
  minDb: number;
  maxDb: number;
  minScale: number;
  maxScale: number;
}

// Anchored to the range firmware 1.1 actually produces. Before the
// level-linearity fix the fleet clamped at ~68 device-dB and never exceeded
// 65.8, so 42/62/82 spanned the whole observable world; post-fix the measured
// range is 33.8 → 97.7 and those anchors pinned every loud sensor to max-red,
// max-size. These are arbitrary VISUAL thresholds on an uncalibrated scale —
// they mean "quiet/busy/loud here", never an absolute level or a legal limit.
export const DEFAULT_STOPS: LevelStops = {
  colors: [
    [45, [79, 93, 117]], // quiet — slate
    [68, [239, 131, 84]], // busy — sound accent
    [90, [179, 54, 42]], // loud — alert red
  ],
  minDb: 35,
  maxDb: 100,
  minScale: 0.4,
  maxScale: 1.55,
};

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

export function levelColor(laeq: number, stops: LevelStops = DEFAULT_STOPS): string {
  const cs = stops.colors;
  let rgb: [number, number, number];
  if (laeq <= cs[0][0]) rgb = cs[0][1];
  else if (laeq >= cs[cs.length - 1][0]) rgb = cs[cs.length - 1][1];
  else {
    let i = 0;
    while (laeq > cs[i + 1][0]) i++;
    const f = (laeq - cs[i][0]) / (cs[i + 1][0] - cs[i][0]);
    rgb = [
      Math.round(lerp(cs[i][1][0], cs[i + 1][1][0], f)),
      Math.round(lerp(cs[i][1][1], cs[i + 1][1][1], f)),
      Math.round(lerp(cs[i][1][2], cs[i + 1][1][2], f)),
    ];
  }
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

export function levelScale(laeq: number, stops: LevelStops = DEFAULT_STOPS): number {
  const f = Math.min(1, Math.max(0, (laeq - stops.minDb) / (stops.maxDb - stops.minDb)));
  return lerp(stops.minScale, stops.maxScale, f);
}

/** Read the palette stops from CSS custom properties (client only, cached).
 *  Falls back to DEFAULT_STOPS values so tests/SSR never break. */
let cssStops: LevelStops | null = null;
export function paletteStops(): LevelStops {
  if (cssStops) return cssStops;
  if (typeof window === "undefined") return DEFAULT_STOPS;
  const read = (name: string, fallback: [number, number, number]): [number, number, number] => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name}, rgb(${fallback.join(",")}))`;
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+/g);
    probe.remove();
    return m ? ([+m[0], +m[1], +m[2]] as [number, number, number]) : fallback;
  };
  cssStops = {
    ...DEFAULT_STOPS,
    colors: [
      [DEFAULT_STOPS.colors[0][0], read("--sw-quiet", DEFAULT_STOPS.colors[0][1])],
      [DEFAULT_STOPS.colors[1][0], read("--sw-sound", DEFAULT_STOPS.colors[1][1])],
      [DEFAULT_STOPS.colors[2][0], read("--sw-loud", DEFAULT_STOPS.colors[2][1])],
    ],
  };
  return cssStops;
}

// --- audible reach -------------------------------------------------------
//
// How far a sound carries, as a radius in metres, so the map can draw circles
// at real-world size instead of a fixed pixel size.
//
// The physics is spherical spreading: a point source loses ~6 dB per doubling
// of distance, so a level difference of ΔdB corresponds to a distance ratio of
// 10^(Δ/20). A sensor reading 6 dB louder than its neighbour is drawn with
// twice the radius, which is the honest part of this.
//
// The ANCHOR is not honest and cannot be: our levels are uncalibrated
// device-dB with an arbitrary zero (CALIB_OFFSET_DB = 0, no absolute
// reference has ever been applied), so there is no defensible absolute
// distance. 55 device-dB -> 33 m is a legible choice, nothing more. Treat
// these circles as "this one is heard about twice as far as that one", never
// as a coverage or nuisance footprint.
//
// Real propagation also involves ground absorption, barriers, reflection off
// façades and wind — a street canyon is nothing like free field. This is a
// first-order illustration.
// Anchor and clamps scaled to a third of their first draft: at full spread a
// handful of loud sensors covered whole districts and the map read as four
// circles rather than fifty. Scaling all three together keeps the ratios —
// the only honest part — exactly intact.
//
// Halved alongside the metresPerPixel correction below. That function returned
// exactly 2x the true value, so every circle has been drawn at half its stated
// radius since it was written — the "55 device-dB gives 33 m" example above was
// 16.5 m on screen. Correcting the constant alone would have doubled every
// circle and undone what was tuned by eye; halving these three preserves what
// is on screen today and makes the numbers finally describe it.
const ANCHOR_DB = 55;
const ANCHOR_M = 16.5;
const MIN_RADIUS_M = 2.5;
const MAX_RADIUS_M = 665;

/** Illustrative audible radius in metres for a level. See the caveats above. */
export function audibleRadiusM(laeq: number): number {
  const r = ANCHOR_M * Math.pow(10, (laeq - ANCHOR_DB) / 20);
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, r));
}

/**
 * Metres per screen pixel at a given latitude and zoom (Web Mercator).
 *
 * The constant is the equator's circumference divided by the TILE SIZE, and
 * mapbox-gl uses 512-pixel tiles — the bundled 3.24.0 has nine literal
 * `tileSize=512` assignments and none for 256. The familiar 156543.03392 is
 * the 256-pixel figure, so using it returned exactly twice the true
 * metres-per-pixel and `diameterPx = 2 * R / mPerPx` came out half. Both
 * clamps bound an octave away from where they read.
 *
 * A test asserting only that this halves per zoom level cannot catch that:
 * a ratio is preserved by any scalar error. levels.test.ts now pins an
 * absolute value at a known latitude and zoom.
 */
const EQUATOR_M = 40_075_016.686;
const TILE_PX = 512;

export function metersPerPixel(lat: number, zoom: number): number {
  return ((EQUATOR_M / TILE_PX) * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

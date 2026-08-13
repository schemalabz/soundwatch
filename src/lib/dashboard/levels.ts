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

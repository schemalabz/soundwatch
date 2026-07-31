// Athens center coordinates
export const ATHENS_CENTER = {
  lng: 23.7275,
  lat: 37.9838,
} as const;

export const ATHENS_ZOOM = 12;

// Locked Athens view: the map opens here and can't zoom out below or pan away.
export const ATHENS_LOCK_ZOOM = 11;

// Attica region bounds — the map can't pan or zoom outside this box.
// [ [west, south], [east, north] ]
export const ATTICA_BOUNDS: [[number, number], [number, number]] = [
  [22.95, 37.6],
  [24.1, 38.35],
];
export const ATTICA_MIN_ZOOM = 9;

export type NoiseLevel = "quiet" | "moderate" | "loud" | "very_loud";

export function getNoiseLevel(dba: number): NoiseLevel {
  if (dba < 55) return "quiet";
  if (dba < 65) return "moderate";
  if (dba < 75) return "loud";
  return "very_loud";
}

export function getNoiseLevelColor(dba: number): string {
  const level = getNoiseLevel(dba);
  switch (level) {
    case "quiet":
      return "#5ba834"; // deep green
    case "moderate":
      return "#c7c43c"; // lime
    case "loud":
      return "#ec832c"; // orange
    case "very_loud":
      return "#d6342a"; // red
  }
}

// The three toggleable map layers, in fixed bottom->top render order.
export type MapLayer = "noise" | "air" | "uv";
export const MAP_LAYER_ORDER: MapLayer[] = ["noise", "air", "uv"];

// mapbox heatmap-color stops (density 0..1). Air = blue->purple.
// Noise: hot core (high density) = red, fading to green at the quiet edges.
export const NOISE_HEAT_COLORS: [number, string][] = [
  [0, "rgba(0,0,0,0)"], [0.15, "#5ba834"], [0.4, "#c7c43c"],
  [0.6, "#e8b335"], [0.8, "#ec832c"], [1, "#d6342a"],
];
export const AIR_HEAT_COLORS: [number, string][] = [
  [0, "rgba(0,0,0,0)"], [0.15, "#4a90d9"], [0.4, "#5566cc"],
  [0.6, "#7048c0"], [0.8, "#8e2fb0"], [1, "#6b1e8f"],
];

// weight ranges: sensor value -> 0..1 (min -> 0, max -> 1)
export const NOISE_WEIGHT_RANGE = [40, 90] as const; // dBA
export const AIR_WEIGHT_RANGE = [5, 60] as const;    // pm2.5 ug/m3

// UV circles: higher UV index -> larger, hotter (violet). Values are small (~0..0.4).
export function getUvColor(uv: number): string {
  if (uv < 0.05) return "#9fd0a8";
  if (uv < 0.12) return "#e5c95a";
  if (uv < 0.2) return "#e8933a";
  return "#c94fb0";
}


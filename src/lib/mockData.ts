// Deterministic mock data for the illustrative dashboard panels.
// Seeded so server-rendered and client-hydrated output match exactly.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(month: number, center: number, width: number) {
  const d = month - center;
  return Math.exp(-(d * d) / (2 * width * width));
}

/** Urban noise sources used as illustrative categories. */
export const NOISE_SOURCES = [
  "traffic",
  "nightlife",
  "construction",
  "aircraft",
  "sirens",
] as const;

export type NoiseSource = (typeof NOISE_SOURCES)[number];

export type Period = "day" | "evening" | "night";
export const PERIODS: Period[] = ["day", "evening", "night"];

// Base intensity (0..1) per source per period — the personality of the city.
const BASE: Record<NoiseSource, Record<Period, number>> = {
  traffic: { day: 0.85, evening: 0.6, night: 0.25 },
  nightlife: { day: 0.15, evening: 0.55, night: 0.9 },
  construction: { day: 0.7, evening: 0.2, night: 0.05 },
  aircraft: { day: 0.5, evening: 0.45, night: 0.3 },
  sirens: { day: 0.4, evening: 0.5, night: 0.55 },
};

/** 7-day forecast: a 0..1 value per source per day, for the given period. */
export function forecastData(period: Period): { key: NoiseSource; days: number[] }[] {
  return NOISE_SOURCES.map((key, i) => {
    const rng = mulberry32((i + 1) * 131 + PERIODS.indexOf(period) * 17);
    const base = BASE[key][period];
    const days = Array.from({ length: 7 }, () =>
      Math.max(0.05, Math.min(1, base + (rng() - 0.5) * 0.35))
    );
    return { key, days };
  });
}

/** 12-month seasonal window per source (0..1, mostly zero outside the window). */
export function calendarData(): { key: NoiseSource; monthly: number[] }[] {
  const centers: Record<NoiseSource, [number, number, number]> = {
    // [center month, width, peak]
    traffic: [5, 6, 0.8],
    nightlife: [6.5, 2.4, 0.95],
    construction: [4, 2.8, 0.85],
    aircraft: [7, 3.2, 0.7],
    sirens: [1.5, 3.5, 0.6],
  };
  return NOISE_SOURCES.map((key) => {
    const [c, w, peak] = centers[key];
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const v = gaussian(m, c, w) * peak;
      return v < 0.06 ? 0 : v;
    });
    return { key, monthly };
  });
}

/** Three overlapping seasonal series (0..1) over 12 months. */
export function seasonsData(): { key: NoiseSource; monthly: number[] }[] {
  const shape: Record<string, [number, number, number]> = {
    traffic: [5.5, 5.5, 0.7],
    nightlife: [6.5, 2.2, 1.0],
    construction: [3.5, 2.6, 0.85],
  };
  return (["traffic", "nightlife", "construction"] as NoiseSource[]).map((key) => {
    const [c, w, peak] = shape[key];
    const monthly = Array.from({ length: 12 }, (_, m) =>
      Math.min(1, gaussian(m, c, w) * peak + 0.04)
    );
    return { key, monthly };
  });
}

/** Diurnal noise index (0..1) for each of the 24 hours of "today". */
export function hourlyData(): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    const v = gaussian(h, 12, 4.5) * 0.95 + gaussian(h, 20, 2.6) * 0.5;
    return Math.max(0.08, Math.min(1, v + 0.08));
  });
}

/** Overall monthly noise index (0..1) for the year wheel. */
export function yearData(): number[] {
  return Array.from({ length: 12 }, (_, m) => {
    const v =
      gaussian(m, 6.5, 2.4) * 0.95 +
      gaussian(m, 4, 2.8) * 0.5 +
      gaussian(m, 0.5, 4) * 0.35;
    return Math.max(0.15, Math.min(1, v));
  });
}

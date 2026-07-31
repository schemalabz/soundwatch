// Dashboard panel data, now sourced from the generated mock
// (scripts/soundbands/build_mock.py -> soundwatchMock.json): band values +
// classification are UrbanSound8K-derived; the diurnal/seasonal timing is a
// synthetic prior. Static JSON, so server/client hydration match.
import mock from "./soundwatchMock.json";

/** The four sound sources the classifier reports (UrbanSound8K-derived). */
export const NOISE_SOURCES = [
  "engine_idling",
  "dog_bark",
  "constructions",
  "siren",
] as const;

export type NoiseSource = (typeof NOISE_SOURCES)[number];

export type Period = "day" | "evening" | "night";
export const PERIODS: Period[] = ["day", "evening", "night"];

type Series = { key: NoiseSource; days?: number[]; monthly?: number[] };

/** 7-day forecast per source, for the given period. */
export function forecastData(period: Period): { key: NoiseSource; days: number[] }[] {
  return (mock.forecast as Record<Period, { key: NoiseSource; days: number[] }[]>)[period];
}

/** 12-month seasonal window per source. */
export function calendarData(): { key: NoiseSource; monthly: number[] }[] {
  return mock.calendar as Series[] as { key: NoiseSource; monthly: number[] }[];
}

/** Overlapping seasonal series (engine_idling/dog_bark/constructions) over 12 months. */
export function seasonsData(): { key: NoiseSource; monthly: number[] }[] {
  return mock.seasons as Series[] as { key: NoiseSource; monthly: number[] }[];
}

/** Diurnal noise index (0..1) for each of the 24 hours. */
export function hourlyData(): number[] {
  return mock.hourly as number[];
}

/** Overall monthly noise index (0..1) for the year wheel. */
export function yearData(): number[] {
  return mock.year as number[];
}

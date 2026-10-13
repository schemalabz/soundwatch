// Response contracts for the dashboard's own endpoints (/api/status,
// /api/series). These are NOT part of the published API: the public surface is
// the zod schemas in ./schemas.ts, which also generate the OpenAPI document.
// These endpoints serve this app's UI only, so a plain TypeScript type is the
// whole contract — but it lives here, not next to either side, so the route
// that produces it and the component that reads it derive from one spelling.
//
// Routes annotate their response literal with these (`const payload: X = {...}`)
// rather than exporting an inferred shape, so a renamed field fails to compile
// in the route itself instead of arriving as undefined at the consumer.

import type { LevelSummary } from "@/lib/server/levelBins";

/* --- /api/status ------------------------------------------------------- */

export type StatusSensor = {
  id: string;
  name: string | null;
  /** Age of this sensor's newest reading; null when it has never reported. */
  secondsAgo: number | null;
  /**
   * Arrival time (receivedAt) of that same newest reading, ISO. secondsAgo is
   * rendered rounded and approximate; this is what the page shows on hover
   * when the reader wants the actual moment.
   */
  lastSeenAt: string | null;
  /** Bitstring, one char per 6h bucket: "1" = at least one reading. */
  cells: string;
};

export interface StatusResponse {
  bucketHours: number;
  windowDays: number;
  sensors: StatusSensor[];
  ingest: { days: number; hours: { t: number; n: number }[] };
}

/* --- /api/series ------------------------------------------------------- */

// The bucket shape IS the server's LevelSummary (type-only import — nothing
// server-side reaches the client bundle).
export type SeriesBucketData = LevelSummary;

export interface SeriesPoint extends SeriesBucketData {
  /** Athens wall time encoded as if UTC — format with timeZone: "UTC". */
  t: number;
}

export interface SeriesResponse {
  /** Bucket id actually served (the server clamps over-fine requests). */
  bucket: string;
  /** Width of one point, in seconds. */
  bucketSeconds: number;
  /** Keyed 0-23. */
  hours: Record<number, SeriesBucketData>;
  /** Keyed 0-6, 0 = Sunday. */
  dows: Record<number, SeriesBucketData>;
  /** Keyed 1-12. */
  months: Record<number, SeriesBucketData>;
  timeline: SeriesPoint[];
}

/* --- /api/usual and /api/departures ------------------------------------ */

export type DayType = "weekday" | "weekend";

/**
 * One sensor's «συνηθισμένο» for one Athens clock hour: the L90–L10 band
 * (and the typical level, L50) of that hour on that kind of day over the past
 * weeks. `buckets` is the number of hour-buckets behind it — the support a
 * reader is owed before a pill is drawn. The rule is src/lib/server/usual.ts.
 */
export interface UsualBand {
  l90: number;
  l50: number;
  l10: number;
  laeq: number;
  n: number;
  buckets: number;
}

export interface UsualResponse {
  at: number;
  hour: number;
  dayType: DayType;
  weeks: number;
  minBuckets: number;
  /** Public sensors with enough history for this hour; the rest are absent. */
  sensors: Record<string, UsualBand>;
}

export interface UsualDayResponse {
  at: number;
  dayStartMs: number;
  dayType: DayType;
  weeks: number;
  minBuckets: number;
  /** sensorId → clock hour → band; hours without enough history are absent. */
  sensors: Record<string, Record<number, UsualBand>>;
}

export interface UsualProfileResponse {
  at: number;
  sensorId: string;
  dayType: DayType;
  weeks: number;
  minBuckets: number;
  /** Keyed 0-23; hours without enough history are absent. */
  hours: Record<number, UsualBand>;
}

/** A run of ten-minute figures outside the band, merged into one row. */
export interface DepartureEpisode {
  sensorId: string;
  startMs: number;
  /** End of the last departing window (exclusive). */
  endMs: number;
  peakLaeq: number;
  peakAtMs: number;
  verdict: "above" | "below";
  /** The band at the peak's hour. */
  l90: number;
  l50: number;
  l10: number;
  /** The last window touches the instant the day was cut at. */
  ongoing: boolean;
}

export interface DeparturesResponse {
  at: number;
  dayStartMs: number;
  dayType: DayType;
  /** Newest first. */
  episodes: DepartureEpisode[];
}

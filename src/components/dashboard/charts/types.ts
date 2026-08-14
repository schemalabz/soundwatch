// Shared client types for the /api/series response. The bucket shape IS the
// server's LevelSummary (type-only import — nothing server-side reaches the
// client bundle).

import type { LevelSummary } from "@/lib/server/levelBins";

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

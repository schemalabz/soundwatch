// Shared client types for the /api/series response.

export interface SeriesBucketData {
  laeq: number;
  l50: number;
  l10: number;
  l90: number;
  lmax: number;
  n: number;
}

export interface SeriesPoint extends SeriesBucketData {
  /** Athens wall time encoded as if UTC — format with timeZone: "UTC". */
  t: number;
}

export interface SeriesResponse {
  bucket: "hour" | "day";
  /** Keyed 0-23. */
  hours: Record<number, SeriesBucketData>;
  /** Keyed 0-6, 0 = Sunday. */
  dows: Record<number, SeriesBucketData>;
  /** Keyed 1-12. */
  months: Record<number, SeriesBucketData>;
  timeline: SeriesPoint[];
}

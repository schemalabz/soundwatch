// The time resolution of the timeline chart: how wide one point is.
//
// Shared by the client (the picker and its viability rules) and the server
// (which clamps defensively), so the two can never disagree about what a
// bucket id means.
//
// The split at one hour is not cosmetic. `readings_hour_bins` is an hourly
// continuous aggregate, so anything an hour or coarser is a regroup of rollup
// rows — cheap at any domain length. Anything finer has to read raw
// `readings`, which is fast over a day (one hypertable chunk) and ruinous over
// ninety. `bucketViable` is what keeps the picker from offering the ruinous
// combinations.

export interface BucketDef {
  id: string;
  seconds: number;
  /** Greek label for the picker. */
  label: string;
}

export const BUCKETS: BucketDef[] = [
  { id: "1m", seconds: 60, label: "1 λεπτό" },
  { id: "5m", seconds: 300, label: "5 λεπτά" },
  { id: "15m", seconds: 900, label: "15 λεπτά" },
  { id: "1h", seconds: 3600, label: "1 ώρα" },
  { id: "1d", seconds: 86_400, label: "1 ημέρα" },
  { id: "1w", seconds: 604_800, label: "1 εβδομάδα" },
];

export const HOUR_S = 3600;

/** Sub-hour buckets cannot come from the hourly rollup. */
export function needsRawReadings(seconds: number): boolean {
  return seconds < HOUR_S;
}

// A chart is unreadable below ~6 points and pointless above ~2000 (more
// points than a wide chart has pixels). The upper bound doubles as the cost
// guard on the raw path: 2000 one-minute buckets is ~33 hours of fleet data.
const MIN_POINTS = 6;
const MAX_POINTS = 2000;

export function pointCount(domainMs: number, seconds: number): number {
  return Math.ceil(domainMs / (seconds * 1000));
}

/** Would this bucket produce a chart worth drawing over this domain? */
export function bucketViable(domainMs: number, seconds: number): boolean {
  const n = pointCount(domainMs, seconds);
  return n >= MIN_POINTS && n <= MAX_POINTS;
}

export function bucketById(id: string | null | undefined): BucketDef | undefined {
  return BUCKETS.find((b) => b.id === id);
}

/**
 * The bucket to use when the user has not chosen one: the finest that stays
 * readable, so a 24-hour domain lands on minutes rather than on 24 flat hours.
 */
export function defaultBucket(domainMs: number): BucketDef {
  return BUCKETS.find((b) => bucketViable(domainMs, b.seconds)) ?? BUCKETS[BUCKETS.length - 1];
}

/**
 * Resolve a requested bucket against a domain, clamping to something the
 * server is willing to compute. Unknown or over-fine requests fall back to
 * the default rather than erroring — a chart URL should not 400 because the
 * domain moved under it.
 */
export function resolveBucket(id: string | null | undefined, domainMs: number): BucketDef {
  const asked = bucketById(id);
  if (asked && bucketViable(domainMs, asked.seconds)) return asked;
  return defaultBucket(domainMs);
}

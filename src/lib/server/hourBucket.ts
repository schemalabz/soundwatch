// "When did this sound happen", in SQL, for the rollup and for raw readings.
//
// Both answer with the CORRECTED time (issue #12): the device clock minus the
// error the ingester estimated (src/lib/fleet/clockOffset.ts). Every
// time-of-day question — hour-of-day curves, day/night and month filters,
// "between 14:00 and 15:00" — must go through these, not through
// rb.device_bucket or r.recorded_at directly.
//
// Each range helper also bounds the PARTITION column (recorded_at, or the
// aggregate's device_bucket), which the corrected time differs from by at most
// CLOCK_DRIFT_CAP_MS. Without that bound a predicate on the expression alone
// cannot prune chunks.

import { CLOCK_DRIFT_CAP_MS } from "@/lib/fleet/clockOffset";

/** The corrected hour of a readings_hour_bins row aliased `rb`. */
export const RB_HOUR = "(rb.device_bucket + make_interval(hours => rb.hour_shift))";

/** The corrected time of a raw readings row aliased `r`. Rows with no estimate fall back to the device clock. */
export const R_TIME = "COALESCE(r.corrected_at, r.recorded_at)";

const HOUR_MS = 3600_000;

/** `AND` predicates: corrected hour >= fromMs (and < toMs when given). */
export function rbHourRangeSql(fromMs: number, toMs?: number): string {
  // |shift| <= 1, so the device hour is within one hour of the corrected one.
  const preds = [
    `rb.device_bucket >= '${new Date(fromMs - HOUR_MS).toISOString()}'::timestamptz`,
    `${RB_HOUR} >= '${new Date(fromMs).toISOString()}'::timestamptz`,
  ];
  if (toMs != null) {
    preds.push(`rb.device_bucket < '${new Date(toMs + HOUR_MS).toISOString()}'::timestamptz`);
    preds.push(`${RB_HOUR} < '${new Date(toMs).toISOString()}'::timestamptz`);
  }
  return preds.map((p) => `AND ${p}`).join("\n      ");
}

/** `AND` predicates: corrected time >= fromMs (and < toMs when given). */
export function rTimeRangeSql(fromMs: number, toMs?: number): string {
  const preds = [
    `r.recorded_at >= '${new Date(fromMs - CLOCK_DRIFT_CAP_MS).toISOString()}'::timestamptz`,
    `${R_TIME} >= '${new Date(fromMs).toISOString()}'::timestamptz`,
  ];
  if (toMs != null) {
    preds.push(`r.recorded_at < '${new Date(toMs + CLOCK_DRIFT_CAP_MS).toISOString()}'::timestamptz`);
    preds.push(`${R_TIME} < '${new Date(toMs).toISOString()}'::timestamptz`);
  }
  return preds.map((p) => `AND ${p}`).join("\n      ");
}

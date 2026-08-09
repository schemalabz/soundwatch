// DashboardFilters -> SQL predicates, shared by every aggregate-style
// endpoint. Consumes the DECODED filter struct (parseWireFilters in
// src/lib/dashboard/filters.ts is the only wire parser), so predicate
// building and JS-side filtering can never disagree about what a param
// means. All fragments are built ONLY from validated enums/numbers —
// nothing user-typed is ever inlined.

import { HOUR_PRESET_RANGES, type DashboardFilters } from "@/lib/dashboard/filters";

/** Athens wall time of a timestamptz column (naive result, wall components). */
export function athensTimeSql(col: string): string {
  return `timezone('Europe/Athens', ${col})`;
}

/** Default time column: raw readings. Rollup queries pass the cagg bucket. */
const DEFAULT_TIME_COL = "r.recorded_at";

/** Day/hour/month predicates over Athens wall time ('' when unrestricted).
 *  The wire encoder only sends restricted sets, so no "everything selected"
 *  normalization is needed here. */
export function filterSql(f: DashboardFilters, timeCol: string = DEFAULT_TIME_COL): string {
  const local = athensTimeSql(timeCol);
  const predicates: string[] = [];

  if (f.days.size === 1) {
    const op = f.days.has("weekend") ? "IN" : "NOT IN";
    predicates.push(`EXTRACT(dow FROM ${local}) ${op} (0, 6)`);
  }
  if (f.hours.size > 0) {
    const hourPreds = [...f.hours].flatMap((h) =>
      HOUR_PRESET_RANGES[h].map(([start, end]) =>
        start <= end
          ? `(EXTRACT(hour FROM ${local}) >= ${start} AND EXTRACT(hour FROM ${local}) < ${end})`
          : `(EXTRACT(hour FROM ${local}) >= ${start} OR EXTRACT(hour FROM ${local}) < ${end})`
      )
    );
    predicates.push(`(${hourPreds.join(" OR ")})`);
  }
  if (f.months.size > 0 && f.months.size < 12) {
    predicates.push(`EXTRACT(month FROM ${local}) IN (${[...f.months].map((m) => m + 1).join(",")})`);
  }
  return predicates.length > 0 ? `AND ${predicates.join(" AND ")}` : "";
}

/** Custom date spans, [start, end) — same semantics as the client. */
export function rangesSql(f: DashboardFilters, timeCol: string = DEFAULT_TIME_COL): string {
  if (f.ranges.length === 0) return "";
  const preds = f.ranges.map(
    (r) =>
      `(${timeCol} >= '${new Date(r.startMs).toISOString()}'::timestamptz AND ${timeCol} < '${new Date(r.endMs).toISOString()}'::timestamptz)`
  );
  return `AND (${preds.join(" OR ")})`;
}

/**
 * Spatial predicate over the sensors table. Planar meters approximation,
 * same constants as withinLocations client-side.
 */
export function locationSql(f: DashboardFilters): string {
  if (f.locations.length === 0) return "";
  const preds = f.locations.map(({ lng, lat, radiusM }) => {
    const mPerDegLng = (Math.cos((lat * Math.PI) / 180) * 111320).toFixed(3);
    return `(power((s.longitude - ${lng}) * ${mPerDegLng}, 2) + power((s.latitude - ${lat}) * 110574, 2) <= ${Math.round(radiusM * radiusM)})`;
  });
  return `AND (${preds.join(" OR ")})`;
}

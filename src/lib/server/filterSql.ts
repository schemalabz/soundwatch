// Dashboard filters -> SQL predicates over Athens wall time, shared by every
// aggregate-style endpoint. All fragments are built ONLY from validated
// enums/ints — nothing user-typed is ever inlined.

/** The Athens wall-time expression for the naive-UTC recorded_at column. */
export const LOCAL_TIME_SQL = "(r.recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens')";

// Mirrors HOUR_PRESET_RANGES in src/lib/dashboard/filters.ts (kept separate:
// this module is server-only and the shapes drift for different reasons).
const HOUR_RANGES: Record<string, [number, number][]> = {
  day: [[7, 19]],
  evening: [[19, 23]],
  night: [[23, 7]],
  peak: [
    [7, 10],
    [17, 20],
  ],
};

/**
 * Parse the wire filter params (days/hours/months as produced by
 * filtersToAggregateQuery) into SQL predicate strings. Unknown values are
 * dropped, months are validated 1-12 ints.
 */
export function filterPredicates(q: URLSearchParams): string[] {
  const local = LOCAL_TIME_SQL;
  const days = q.get("days"); // 'weekend' | 'weekday' | null
  const hours = (q.get("hours") ?? "").split(",").filter((h) => h in HOUR_RANGES);
  const months = (q.get("months") ?? "")
    .split(",")
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

  const predicates: string[] = [];
  if (days === "weekend") predicates.push(`EXTRACT(dow FROM ${local}) IN (0, 6)`);
  if (days === "weekday") predicates.push(`EXTRACT(dow FROM ${local}) NOT IN (0, 6)`);
  if (hours.length > 0) {
    const hourPreds = hours.flatMap((h) =>
      HOUR_RANGES[h].map(([start, end]) =>
        start <= end
          ? `(EXTRACT(hour FROM ${local}) >= ${start} AND EXTRACT(hour FROM ${local}) < ${end})`
          : `(EXTRACT(hour FROM ${local}) >= ${start} OR EXTRACT(hour FROM ${local}) < ${end})`
      )
    );
    predicates.push(`(${hourPreds.join(" OR ")})`);
  }
  if (months.length > 0 && months.length < 12) {
    predicates.push(`EXTRACT(month FROM ${local}) IN (${months.join(",")})`);
  }
  return predicates;
}

/** The predicates joined into an AND-able SQL fragment ('' when unfiltered). */
export function filterSql(q: URLSearchParams): string {
  const predicates = filterPredicates(q);
  return predicates.length > 0 ? `AND ${predicates.join(" AND ")}` : "";
}

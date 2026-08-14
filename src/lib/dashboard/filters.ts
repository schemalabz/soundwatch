// Dashboard filter model + the pure math that turns filters into concrete
// time segments on the seeker bar. No React in here — everything is unit
// tested in filters.test.ts.
//
// Convention: an empty set means "no restriction". Selecting both weekend
// and weekday chips is the same as selecting neither — the UI may render
// that state, the math treats it as "all days".

import { athensWallTime, nextAthensMidnight } from "./time";

export type DayGroup = "weekend" | "weekday";

// Hour presets anchor to the EU Environmental Noise Directive periods, so
// filtered numbers stay comparable to official Lden/Lnight reporting — plus
// "peak", the two traffic rush windows, which a preset can only express as
// multiple ranges (hence the list shape).
export type HourPreset = "day" | "evening" | "night" | "peak";

/** [startHour, endHour) pairs in Athens wall time; night wraps midnight. */
export const HOUR_PRESET_RANGES: Record<HourPreset, [number, number][]> = {
  day: [[7, 19]],
  evening: [[19, 23]],
  night: [[23, 7]],
  peak: [
    [7, 10],
    [17, 20],
  ],
};

// "Period" is one-of (unlike the combinable chips): it narrows the whole
// domain to a trailing window ending now.
export type PeriodId = "24h" | "7d" | "30d";

export const PERIOD_MS: Record<PeriodId, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

/** An absolute date span, [startMs, endMs) in Athens wall time (endMs is
 *  the midnight AFTER the last included day). */
export interface DateRange {
  startMs: number;
  endMs: number;
}

/** A spatial filter pin: keep sensors within radiusM of (lng, lat). */
export interface LocationPin {
  lng: number;
  lat: number;
  radiusM: number;
  /** Reverse-geocoded short address ("Πυθαγόρα 4"); null while resolving. */
  label: string | null;
}

export interface DashboardFilters {
  period: PeriodId | null;
  days: ReadonlySet<DayGroup>;
  hours: ReadonlySet<HourPreset>;
  /** 0 = January ... 11 = December */
  months: ReadonlySet<number>;
  /** Custom date spans (one-of with period: the UI clears one when the
   *  other is chosen; the math simply ANDs whatever is set). */
  ranges: readonly DateRange[];
  locations: readonly LocationPin[];
}

export const EMPTY_FILTERS: DashboardFilters = {
  period: null,
  days: new Set(),
  hours: new Set(),
  months: new Set(),
  ranges: [],
  locations: [],
};

/** The domain start the period dictates (data start when no period). */
export function periodStartMs(f: DashboardFilters, dataStartMs: number, nowMs: number): number {
  return f.period ? Math.max(dataStartMs, nowMs - PERIOD_MS[f.period]) : dataStartMs;
}

export function isUnfiltered(f: DashboardFilters): boolean {
  return (
    f.period === null &&
    effectiveDays(f).size === 0 &&
    effectiveHours(f).size === 0 &&
    effectiveMonths(f).size === 0 &&
    f.ranges.length === 0 &&
    f.locations.length === 0
  );
}

// "Both chips" and "no chips" both mean no restriction.
function effectiveDays(f: DashboardFilters): ReadonlySet<DayGroup> {
  return f.days.size >= 2 ? new Set() : f.days;
}
function effectiveHours(f: DashboardFilters): ReadonlySet<HourPreset> {
  // day+evening+night covers all 24h (peak is a subset of day∪evening, so
  // it can never change coverage) — that combination means no restriction.
  const covered = (["day", "evening", "night"] as const).every((h) => f.hours.has(h));
  return covered ? new Set() : f.hours;
}
function effectiveMonths(f: DashboardFilters): ReadonlySet<number> {
  return f.months.size >= 12 ? new Set() : f.months;
}

function dayMatches(dow: number, days: ReadonlySet<DayGroup>): boolean {
  if (days.size === 0) return true;
  const isWeekend = dow === 0 || dow === 6;
  return days.has(isWeekend ? "weekend" : "weekday");
}

function hourMatches(hour: number, hours: ReadonlySet<HourPreset>): boolean {
  if (hours.size === 0) return true;
  for (const preset of hours) {
    for (const [start, end] of HOUR_PRESET_RANGES[preset]) {
      if (start <= end ? hour >= start && hour < end : hour >= start || hour < end) return true;
    }
  }
  return false;
}

function inRanges(epochMs: number, ranges: readonly DateRange[]): boolean {
  if (ranges.length === 0) return true;
  for (const r of ranges) if (epochMs >= r.startMs && epochMs < r.endMs) return true;
  return false;
}

/** Does the instant t satisfy the filters? (Used for the LIVE gate.) */
export function instantMatches(f: DashboardFilters, epochMs: number): boolean {
  const w = athensWallTime(epochMs);
  return (
    dayMatches(w.dow, effectiveDays(f)) &&
    hourMatches(w.hour, effectiveHours(f)) &&
    (effectiveMonths(f).size === 0 || effectiveMonths(f).has(w.month)) &&
    inRanges(epochMs, f.ranges)
  );
}

/** How a day sits against the range set: fully covered, partially, or out. */
function dayRangeState(dayStart: number, dayEnd: number, ranges: readonly DateRange[]): "full" | "partial" | "out" {
  if (ranges.length === 0) return "full";
  let partial = false;
  for (const r of ranges) {
    if (r.startMs <= dayStart && dayEnd <= r.endMs) return "full";
    if (r.startMs < dayEnd && r.endMs > dayStart) partial = true;
  }
  return partial ? "partial" : "out";
}

/**
 * Would these filters match ANY instant in [startMs, endMs)? Cheap: walks
 * days with immediate exit — a matching full day always contains every hour
 * preset, so hour-level probing is only needed on partial edge days. Used to
 * disable filter options that would select nothing (e.g. "weekdays" inside a
 * last-24h window that sits entirely on a Sunday).
 */
export function hasAnyMatch(f: DashboardFilters, startMs: number, endMs: number): boolean {
  if (endMs <= startMs) return false;
  const days = effectiveDays(f);
  const hours = effectiveHours(f);
  const months = effectiveMonths(f);

  let dayStart = startMs;
  while (dayStart < endMs) {
    const dayEnd = Math.min(nextAthensMidnight(dayStart), endMs);
    const w = athensWallTime(dayStart);
    const rangeState = dayRangeState(dayStart, dayEnd, f.ranges);
    if (rangeState !== "out" && dayMatches(w.dow, days) && (months.size === 0 || months.has(w.month))) {
      const fullDay = dayEnd - dayStart >= 23 * 3600_000;
      if (rangeState === "full" && hours.size === 0) return true;
      if (rangeState === "full" && fullDay) return true; // a full day contains every hour preset
      for (let t = dayStart; t < dayEnd; t += 3600_000) {
        if (hourMatches(athensWallTime(t).hour, hours) && inRanges(t, f.ranges)) return true;
      }
    }
    dayStart = dayEnd;
  }
  return false;
}

/** Query params for /api/aggregate from the current filters (effective
 *  sets: "everything selected" serializes as no restriction). Months are
 *  1-based on the wire to match SQL EXTRACT(month). */
export function filtersToAggregateQuery(f: DashboardFilters, effectiveStartMs: number): string {
  const params = new URLSearchParams();
  params.set("from", String(Math.floor(effectiveStartMs)));
  const days = effectiveDays(f);
  if (days.size === 1) params.set("days", [...days][0]);
  const hours = effectiveHours(f);
  if (hours.size > 0) params.set("hours", [...hours].join(","));
  const months = effectiveMonths(f);
  if (months.size > 0 && months.size < 12) params.set("months", [...months].map((m) => m + 1).join(","));
  if (f.ranges.length > 0) {
    params.set("ranges", f.ranges.map((r) => `${Math.floor(r.startMs)}:${Math.floor(r.endMs)}`).join(","));
  }
  if (f.locations.length > 0) {
    params.set(
      "loc",
      f.locations.map((p) => `${p.lng.toFixed(5)}:${p.lat.toFixed(5)}:${Math.round(p.radiusM)}`).join(",")
    );
  }
  return params.toString();
}

// Planar meters-per-degree approximation — centimeter-league error at city
// scale, and identical to the SQL predicate in src/lib/server/filterSql.ts.
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG_EQ = 111_320;

/** Is the point inside ANY of the location pins? (No pins = everywhere.) */
export function withinLocations(lng: number, lat: number, locations: readonly LocationPin[]): boolean {
  if (locations.length === 0) return true;
  for (const p of locations) {
    const dx = (lng - p.lng) * Math.cos((p.lat * Math.PI) / 180) * M_PER_DEG_LNG_EQ;
    const dy = (lat - p.lat) * M_PER_DEG_LAT;
    if (dx * dx + dy * dy <= p.radiusM * p.radiusM) return true;
  }
  return false;
}

/** Which hours of the day (0-23) the filters admit — for muting chart
 *  sectors in sync with the data the API will actually return. */
export function hourSelectionMask(f: DashboardFilters): boolean[] {
  const hours = effectiveHours(f);
  return Array.from({ length: 24 }, (_, h) => hourMatches(h, hours));
}

/** Which days of the week (0 = Sunday) the filters admit. */
export function dowSelectionMask(f: DashboardFilters): boolean[] {
  const days = effectiveDays(f);
  return Array.from({ length: 7 }, (_, d) => dayMatches(d, days));
}

/** Which months (0 = January) the filters admit. */
export function monthSelectionMask(f: DashboardFilters): boolean[] {
  const months = effectiveMonths(f);
  return Array.from({ length: 12 }, (_, m) => months.size === 0 || months.has(m));
}

/**
 * The latest instant a request may name. Number.isFinite is not a bound:
 * `from=1e20` is finite, passes every guard we had, and then throws
 * RangeError inside toISOString() — an unauthenticated 500 produced by a
 * query string. Anything past 2100 is a typo or a probe, either way not a
 * question about noise in Athens.
 */
export const MAX_EPOCH_MS = Date.UTC(2100, 0, 1);

/** The widest location radius a request may name: 200 km, a generous Athens. */
export const MAX_RADIUS_M = 200_000;

/** An epoch-ms parameter, or null if it is missing, unparseable or absurd. */
export function parseEpochMs(raw: string | null | undefined): number | null {
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) && n > 0 && n <= MAX_EPOCH_MS ? n : null;
}

/**
 * The single decoder for the wire format filtersToAggregateQuery emits —
 * every server consumer (JS instantMatches paths AND SQL predicate
 * builders) goes through this, so the two can never drift. Unknown or
 * malformed values are dropped; pin labels don't travel.
 */
export function parseWireFilters(q: URLSearchParams): DashboardFilters {
  const days = q.get("days");
  const hours = (q.get("hours") ?? "").split(",").filter(Boolean);
  const months = (q.get("months") ?? "")
    .split(",")
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  const ranges = (q.get("ranges") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.split(":").map(Number))
    .filter((a) => a.length === 2 && a.every((n) => n > 0 && n <= MAX_EPOCH_MS) && a[0] < a[1])
    .map(([startMs, endMs]) => ({ startMs, endMs }));
  // Bounded, not merely finite. locationSql inlines Math.round(radiusM ** 2)
  // into SQL, and that overflows to Infinity above ~1e155 — which renders as a
  // bare `Infinity` token and makes Postgres answer "column \"infinity\" does
  // not exist". An unauthenticated 500 from a query string, same class as the
  // three closed in 781086b, which bounded from/ranges/hours and missed loc.
  //
  // The bounds are the domain's own: a longitude, a latitude, and a radius no
  // larger than a very generous Athens.
  const locations = (q.get("loc") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.split(":").map(Number))
    .filter(
      (a) =>
        a.length === 3 &&
        a.every(Number.isFinite) &&
        a[0] >= -180 &&
        a[0] <= 180 &&
        a[1] >= -90 &&
        a[1] <= 90 &&
        a[2] > 0 &&
        a[2] <= MAX_RADIUS_M
    )
    .map(([lng, lat, radiusM]) => ({ lng, lat, radiusM, label: null }));
  return {
    period: null, // already folded into from= by the encoder
    days: new Set(days === "weekend" || days === "weekday" ? [days as DayGroup] : []),
    // Object.hasOwn, not `in`: `in` walks the prototype chain, so
    // hours=toString would pass here and then crash filterSql, which calls
    // .map() on what it assumes is a range array.
    hours: new Set(hours.filter((h): h is HourPreset => Object.hasOwn(HOUR_PRESET_RANGES, h))),
    months: new Set(months.map((m) => m - 1)),
    ranges,
    locations,
  };
}

export interface TimeSegment {
  /** epoch ms, inclusive */
  startMs: number;
  /** epoch ms, exclusive */
  endMs: number;
}

/**
 * The concrete time periods the filters select within [rangeStart, rangeEnd],
 * merged and ordered. Resolution is one hour — the finest granularity any
 * filter can express — probed at Athens wall time, walking real day
 * boundaries so DST days (23h/25h) stay correct.
 */
export function selectedSegments(f: DashboardFilters, rangeStartMs: number, rangeEndMs: number): TimeSegment[] {
  if (rangeEndMs <= rangeStartMs) return [];
  if (isUnfiltered(f)) return [{ startMs: rangeStartMs, endMs: rangeEndMs }];

  const days = effectiveDays(f);
  const hours = effectiveHours(f);
  const months = effectiveMonths(f);

  const segments: TimeSegment[] = [];
  let open: TimeSegment | null = null;

  let dayStart = rangeStartMs;
  while (dayStart < rangeEndMs) {
    const dayEnd = Math.min(nextAthensMidnight(dayStart), rangeEndMs);
    const w = athensWallTime(dayStart);
    const rangeState = dayRangeState(dayStart, dayEnd, f.ranges);
    const dayOk = rangeState !== "out" && dayMatches(w.dow, days) && (months.size === 0 || months.has(w.month));

    if (dayOk && rangeState === "full" && hours.size === 0) {
      // Whole day selected — no need to walk hours.
      if (open && open.endMs === dayStart) open.endMs = dayEnd;
      else segments.push((open = { startMs: dayStart, endMs: dayEnd }));
    } else if (dayOk) {
      // Walk the day hour-by-hour (24 iterations; 23/25 on DST days).
      let t = dayStart;
      while (t < dayEnd) {
        const hourEnd = Math.min(t + 3600_000, dayEnd);
        if (hourMatches(athensWallTime(t).hour, hours) && inRanges(t, f.ranges)) {
          if (open && open.endMs === t) open.endMs = hourEnd;
          else segments.push((open = { startMs: t, endMs: hourEnd }));
        }
        t = hourEnd;
      }
    }
    dayStart = dayEnd;
  }
  return segments;
}

/** Total selected duration in ms. */
export function selectedDurationMs(segments: TimeSegment[]): number {
  return segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
}

/** The segment containing t, or the nearest one (for scrub snapping). */
export function snapToSegments(segments: TimeSegment[], epochMs: number): number {
  if (segments.length === 0) return epochMs;
  for (const s of segments) {
    if (epochMs >= s.startMs && epochMs < s.endMs) return epochMs;
  }
  let best = segments[0].startMs;
  let bestDist = Infinity;
  for (const s of segments) {
    for (const edge of [s.startMs, s.endMs - 1]) {
      const d = Math.abs(edge - epochMs);
      if (d < bestDist) {
        bestDist = d;
        best = edge;
      }
    }
  }
  return best;
}

/**
 * Advance a playing cursor by dt, skipping unselected gaps (the discontinuous
 * timeline is the feature: playback jumps Friday-night -> Saturday). Returns
 * null when playback ran off the end of the last segment.
 */
export function advanceCursor(segments: TimeSegment[], cursorMs: number, dtMs: number): number | null {
  let i = segments.findIndex((s) => cursorMs < s.endMs);
  if (i === -1) return null;
  let t = Math.max(cursorMs, segments[i].startMs);
  let remaining = dtMs;
  for (;;) {
    const room = segments[i].endMs - t;
    if (remaining < room) return t + remaining;
    remaining -= room;
    i++;
    if (i >= segments.length) return null;
    t = segments[i].startMs;
  }
}

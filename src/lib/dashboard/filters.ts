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
// filtered numbers stay comparable to official Lden/Lnight reporting.
export type HourPreset = "day" | "evening" | "night";

/** [startHour, endHour) in Athens wall time; night wraps midnight. */
export const HOUR_PRESET_RANGES: Record<HourPreset, [number, number]> = {
  day: [7, 19],
  evening: [19, 23],
  night: [23, 7],
};

// "Period" is one-of (unlike the combinable chips): it narrows the whole
// domain to a trailing window ending now.
export type PeriodId = "24h" | "7d" | "30d";

export const PERIOD_MS: Record<PeriodId, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export interface DashboardFilters {
  period: PeriodId | null;
  days: ReadonlySet<DayGroup>;
  hours: ReadonlySet<HourPreset>;
  /** 0 = January ... 11 = December */
  months: ReadonlySet<number>;
}

export const EMPTY_FILTERS: DashboardFilters = {
  period: null,
  days: new Set(),
  hours: new Set(),
  months: new Set(),
};

/** The domain start the period dictates (data start when no period). */
export function periodStartMs(f: DashboardFilters, dataStartMs: number, nowMs: number): number {
  return f.period ? Math.max(dataStartMs, nowMs - PERIOD_MS[f.period]) : dataStartMs;
}

export function isUnfiltered(f: DashboardFilters): boolean {
  return (
    f.period === null && effectiveDays(f).size === 0 && effectiveHours(f).size === 0 && effectiveMonths(f).size === 0
  );
}

// "Both chips" and "no chips" both mean no restriction.
function effectiveDays(f: DashboardFilters): ReadonlySet<DayGroup> {
  return f.days.size >= 2 ? new Set() : f.days;
}
function effectiveHours(f: DashboardFilters): ReadonlySet<HourPreset> {
  return f.hours.size >= 3 ? new Set() : f.hours;
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
    const [start, end] = HOUR_PRESET_RANGES[preset];
    if (start <= end ? hour >= start && hour < end : hour >= start || hour < end) return true;
  }
  return false;
}

/** Does the instant t satisfy the filters? (Used for the LIVE gate.) */
export function instantMatches(f: DashboardFilters, epochMs: number): boolean {
  const w = athensWallTime(epochMs);
  return (
    dayMatches(w.dow, effectiveDays(f)) &&
    hourMatches(w.hour, effectiveHours(f)) &&
    (effectiveMonths(f).size === 0 || effectiveMonths(f).has(w.month))
  );
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
    if (dayMatches(w.dow, days) && (months.size === 0 || months.has(w.month))) {
      if (hours.size === 0) return true;
      const fullDay = dayEnd - dayStart >= 23 * 3600_000;
      if (fullDay) return true; // a full day contains every hour preset
      for (let t = dayStart; t < dayEnd; t += 3600_000) {
        if (hourMatches(athensWallTime(t).hour, hours)) return true;
      }
    }
    dayStart = dayEnd;
  }
  return false;
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
    const dayOk = dayMatches(w.dow, days) && (months.size === 0 || months.has(w.month));

    if (dayOk && hours.size === 0) {
      // Whole day selected — no need to walk hours.
      if (open && open.endMs === dayStart) open.endMs = dayEnd;
      else segments.push((open = { startMs: dayStart, endMs: dayEnd }));
    } else if (dayOk) {
      // Walk the day hour-by-hour (24 iterations; 23/25 on DST days).
      let t = dayStart;
      while (t < dayEnd) {
        const hourEnd = Math.min(t + 3600_000, dayEnd);
        if (hourMatches(athensWallTime(t).hour, hours)) {
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

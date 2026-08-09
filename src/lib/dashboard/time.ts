// Athens-local time helpers for the dashboard. All filter semantics (days,
// hours, months) are defined in Europe/Athens wall time — a "night" filter
// must mean Athens nights across DST changes, not UTC offsets.
//
// Implementation note: Intl.DateTimeFormat is the only DST-correct source of
// wall time in the browser, but it is slow; we cache the formatter and only
// call it once per probed instant (segment computation probes a few thousand
// instants at most).

export const ATHENS_TZ = "Europe/Athens";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ATHENS_TZ,
  hour12: false,
  weekday: "short",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface AthensWallTime {
  /** 0 = Sunday ... 6 = Saturday */
  dow: number;
  /** 0-23 */
  hour: number;
  /** 0-11 */
  month: number;
  year: number;
  day: number;
}

export function athensWallTime(epochMs: number): AthensWallTime {
  const parts = partsFmt.formatToParts(epochMs);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  // "24" appears for midnight with hourCycle quirks; normalize.
  const rawHour = Number(get("hour"));
  return {
    dow: WEEKDAY_INDEX[get("weekday")] ?? 0,
    hour: rawHour === 24 ? 0 : rawHour,
    month: Number(get("month")) - 1,
    year: Number(get("year")),
    day: Number(get("day")),
  };
}

/** Epoch ms of the next Athens midnight strictly after t (DST-safe probe). */
export function nextAthensMidnight(epochMs: number): number {
  const { day } = athensWallTime(epochMs);
  // Jump close to midnight, then walk hour-by-hour: cheap and DST-proof.
  let t = epochMs + (24 - athensWallTime(epochMs).hour) * 3600_000 - 3600_000;
  while (athensWallTime(t).day === day) t += 3600_000;
  // Snap back to the top of that hour's start-of-day: probe backwards by hour
  // until the day flips, then the flip point is within one hour — refine by
  // minute for a clean boundary.
  let lo = t - 3600_000;
  let hi = t;
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 2 / 60_000) * 60_000;
    if (athensWallTime(mid).day === day) lo = mid;
    else hi = mid;
  }
  return hi;
}

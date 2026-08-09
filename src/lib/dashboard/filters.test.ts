import { describe, expect, it } from "vitest";
import {
  advanceCursor,
  EMPTY_FILTERS,
  hasAnyMatch,
  instantMatches,
  isUnfiltered,
  selectedDurationMs,
  selectedSegments,
  snapToSegments,
  type DashboardFilters,
} from "./filters";
import { athensWallTime } from "./time";

// June 2026: Athens is UTC+3 (EEST). 2026-06-15 is a Monday.
const MON_JUNE_15_MIDNIGHT_ATHENS = Date.UTC(2026, 5, 14, 21, 0, 0); // 00:00 Athens
const DAY = 86_400_000;
const HOUR = 3_600_000;

function filters(partial: Partial<DashboardFilters>): DashboardFilters {
  return { ...EMPTY_FILTERS, ...partial };
}

describe("athensWallTime", () => {
  it("converts UTC to Athens wall time (EEST, +3)", () => {
    const w = athensWallTime(MON_JUNE_15_MIDNIGHT_ATHENS);
    expect(w.hour).toBe(0);
    expect(w.dow).toBe(1); // Monday
    expect(w.month).toBe(5); // June
    expect(w.day).toBe(15);
  });

  it("handles winter time (EET, +2)", () => {
    // 2026-01-15 10:00 UTC = 12:00 Athens
    const w = athensWallTime(Date.UTC(2026, 0, 15, 10, 0, 0));
    expect(w.hour).toBe(12);
  });
});

describe("selectedSegments", () => {
  const start = MON_JUNE_15_MIDNIGHT_ATHENS;
  const end = start + 14 * DAY; // two full Mon-Sun weeks

  it("unfiltered selects the whole range as one segment", () => {
    const segs = selectedSegments(EMPTY_FILTERS, start, end);
    expect(segs).toEqual([{ startMs: start, endMs: end }]);
    expect(isUnfiltered(EMPTY_FILTERS)).toBe(true);
  });

  it("selecting both day chips equals no restriction", () => {
    const f = filters({ days: new Set(["weekend", "weekday"]) });
    expect(selectedSegments(f, start, end)).toEqual([{ startMs: start, endMs: end }]);
  });

  it("weekend filter selects exactly the two Sat+Sun blocks", () => {
    const f = filters({ days: new Set(["weekend"]) });
    const segs = selectedSegments(f, start, end);
    expect(segs).toHaveLength(2); // Sat+Sun merge into one block per week
    expect(selectedDurationMs(segs)).toBe(4 * DAY);
    for (const s of segs) {
      expect(athensWallTime(s.startMs).dow).toBe(6); // starts Saturday 00:00
      expect(athensWallTime(s.startMs).hour).toBe(0);
    }
  });

  it("night preset wraps midnight and merges across day boundaries", () => {
    const f = filters({ hours: new Set(["night"]) });
    const segs = selectedSegments(f, start, start + 2 * DAY);
    // 00:00-07:00, 23:00-07:00(+1), 23:00-24:00 => 3 segments in 2 days
    expect(segs).toHaveLength(3);
    expect(selectedDurationMs(segs)).toBe((7 + 8 + 1) * HOUR);
    // The middle segment must span midnight as ONE segment.
    const middle = segs[1];
    expect((middle.endMs - middle.startMs) / HOUR).toBe(8);
  });

  it("weekend nights compose day and hour filters", () => {
    const f = filters({ days: new Set(["weekend"]), hours: new Set(["night"]) });
    const segs = selectedSegments(f, start, end);
    // Each weekend: Sat 00-07, Sat 23-Sun 07, Sun 23-24. Two weekends.
    expect(segs).toHaveLength(6);
    expect(selectedDurationMs(segs)).toBe(2 * (7 + 8 + 1) * HOUR);
  });

  it("month filter drops out-of-month days", () => {
    // Range spans June 25 - July 5; filter to June only.
    const s = MON_JUNE_15_MIDNIGHT_ATHENS + 10 * DAY;
    const f = filters({ months: new Set([5]) });
    const segs = selectedSegments(f, s, s + 10 * DAY);
    expect(segs).toHaveLength(1);
    expect(selectedDurationMs(segs)).toBe(6 * DAY); // Jun 25..30 inclusive
  });
});

describe("instantMatches (the LIVE gate)", () => {
  it("weekend filter admits Saturday and rejects Monday", () => {
    const f = filters({ days: new Set(["weekend"]) });
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 12 * HOUR)).toBe(false); // Mon noon
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 5 * DAY + 12 * HOUR)).toBe(true); // Sat noon
  });

  it("night filter admits 02:00 and rejects noon", () => {
    const f = filters({ hours: new Set(["night"]) });
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 2 * HOUR)).toBe(true);
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 12 * HOUR)).toBe(false);
  });

  it("peak filter admits both rush windows and rejects the midday lull", () => {
    const f = filters({ hours: new Set(["peak"]) });
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 8 * HOUR)).toBe(true); // morning rush
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 18 * HOUR)).toBe(true); // evening rush
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 13 * HOUR)).toBe(false); // between
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 2 * HOUR)).toBe(false); // night
  });

  it("hour restriction lifts only when day+evening+night are all on — not on any 3 presets", () => {
    const covered = filters({ hours: new Set(["day", "evening", "night"]) });
    expect(instantMatches(covered, MON_JUNE_15_MIDNIGHT_ATHENS + 2 * HOUR)).toBe(true);
    const notCovered = filters({ hours: new Set(["day", "evening", "peak"]) });
    expect(instantMatches(notCovered, MON_JUNE_15_MIDNIGHT_ATHENS + 2 * HOUR)).toBe(false); // 02:00 still excluded
  });
});

describe("custom date ranges", () => {
  const DAY2 = MON_JUNE_15_MIDNIGHT_ATHENS + 2 * DAY;
  const DAY4 = MON_JUNE_15_MIDNIGHT_ATHENS + 4 * DAY;

  it("instantMatches admits only instants inside a range", () => {
    const f = filters({ ranges: [{ startMs: DAY2, endMs: DAY4 }] });
    expect(instantMatches(f, DAY2 + 5 * HOUR)).toBe(true);
    expect(instantMatches(f, MON_JUNE_15_MIDNIGHT_ATHENS + 5 * HOUR)).toBe(false);
    expect(instantMatches(f, DAY4 + 1)).toBe(false); // end exclusive
  });

  it("a single contiguous range yields one segment covering it exactly", () => {
    const f = filters({ ranges: [{ startMs: DAY2, endMs: DAY4 }] });
    const segs = selectedSegments(f, MON_JUNE_15_MIDNIGHT_ATHENS, MON_JUNE_15_MIDNIGHT_ATHENS + 7 * DAY);
    expect(segs).toEqual([{ startMs: DAY2, endMs: DAY4 }]);
  });

  it("two disjoint ranges yield two segments; hour presets intersect them", () => {
    const f = filters({
      ranges: [
        { startMs: MON_JUNE_15_MIDNIGHT_ATHENS, endMs: MON_JUNE_15_MIDNIGHT_ATHENS + DAY },
        { startMs: DAY4, endMs: DAY4 + DAY },
      ],
    });
    expect(selectedSegments(f, MON_JUNE_15_MIDNIGHT_ATHENS, MON_JUNE_15_MIDNIGHT_ATHENS + 7 * DAY)).toHaveLength(2);
    const withNight = filters({ ranges: [...f.ranges], hours: new Set(["night"]) });
    const segs = selectedSegments(withNight, MON_JUNE_15_MIDNIGHT_ATHENS, MON_JUNE_15_MIDNIGHT_ATHENS + 7 * DAY);
    // night 23-07 inside two separated days: 00-07 + 23-24 per day = 4 segments
    expect(segs).toHaveLength(4);
    expect(segs.every((s) => instantMatches(withNight, s.startMs))).toBe(true);
  });
});

describe("hasAnyMatch (option viability)", () => {
  it("rejects weekdays inside a window that is entirely weekend", () => {
    // Saturday 00:00 + 24h window = all weekend.
    const satMidnight = MON_JUNE_15_MIDNIGHT_ATHENS + 5 * DAY;
    expect(hasAnyMatch(filters({ days: new Set(["weekday"]) }), satMidnight, satMidnight + DAY)).toBe(false);
    expect(hasAnyMatch(filters({ days: new Set(["weekend"]) }), satMidnight, satMidnight + DAY)).toBe(true);
  });

  it("accepts any hour preset over a full day", () => {
    for (const h of ["day", "evening", "night"] as const) {
      expect(hasAnyMatch(filters({ hours: new Set([h]) }), MON_JUNE_15_MIDNIGHT_ATHENS, MON_JUNE_15_MIDNIGHT_ATHENS + DAY)).toBe(true);
    }
  });

  it("probes hours on partial edge days", () => {
    // Window = Monday 10:00-14:00 Athens: "night" (23-07) cannot match.
    const start = MON_JUNE_15_MIDNIGHT_ATHENS + 10 * HOUR;
    expect(hasAnyMatch(filters({ hours: new Set(["night"]) }), start, start + 4 * HOUR)).toBe(false);
    expect(hasAnyMatch(filters({ hours: new Set(["day"]) }), start, start + 4 * HOUR)).toBe(true);
  });

  it("rejects months absent from the window", () => {
    expect(hasAnyMatch(filters({ months: new Set([0]) }), MON_JUNE_15_MIDNIGHT_ATHENS, MON_JUNE_15_MIDNIGHT_ATHENS + 10 * DAY)).toBe(false);
  });
});

describe("cursor mechanics", () => {
  const segs = [
    { startMs: 0, endMs: 10 * HOUR },
    { startMs: 24 * HOUR, endMs: 30 * HOUR },
  ];

  it("snaps into the nearest segment", () => {
    expect(snapToSegments(segs, 5 * HOUR)).toBe(5 * HOUR); // inside: unchanged
    expect(snapToSegments(segs, 12 * HOUR)).toBe(10 * HOUR - 1); // gap: nearest edge
    expect(snapToSegments(segs, 23 * HOUR)).toBe(24 * HOUR);
  });

  it("advances within a segment", () => {
    expect(advanceCursor(segs, 2 * HOUR, HOUR)).toBe(3 * HOUR);
  });

  it("skips the gap, carrying overshoot", () => {
    expect(advanceCursor(segs, 9 * HOUR, 2 * HOUR)).toBe(25 * HOUR);
  });

  it("returns null past the end", () => {
    expect(advanceCursor(segs, 29 * HOUR, 2 * HOUR)).toBeNull();
  });
});

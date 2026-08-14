import { describe, expect, it } from "vitest";
import { computeGraduations } from "./graduations";
import { athensWallTime } from "./time";

const HOUR = 3_600_000;
const DAY = 86_400_000;
// Monday 2026-06-15 00:00 Athens (EEST = UTC+3).
const START = Date.UTC(2026, 5, 14, 21, 0, 0);

describe("computeGraduations — month mode (long domains)", () => {
  it("majors at month firsts plus an edge label for the starting month", () => {
    const gs = computeGraduations(START, START + 30 * DAY, 1200, "el");
    const majors = gs.filter((g) => g.size === "major");
    expect(majors).toHaveLength(2); // June edge label + July 1 boundary
    expect(majors[0].fraction).toBe(0);
    for (const m of majors) expect(m.sectionLabel).toBeTruthy();
  });

  it("marks Athens-local Mondays as mids with day-number cell labels", () => {
    const gs = computeGraduations(START, START + 30 * DAY, 1200, "el");
    const mids = gs.filter((g) => g.size === "mid");
    expect(mids.length).toBeGreaterThanOrEqual(3);
    for (const g of mids) {
      const w = athensWallTime(START + g.fraction * 30 * DAY);
      expect(w.dow).toBe(1); // Monday
      expect(w.hour).toBe(0); // true local midnight
      expect(g.cellLabel).toBeTruthy();
    }
  });

  it("drops day minors when pixels are tight", () => {
    const wide = computeGraduations(START, START + 30 * DAY, 1200, "el");
    const narrow = computeGraduations(START, START + 30 * DAY, 150, "el");
    expect(wide.some((g) => g.size === "minor")).toBe(true);
    expect(narrow.some((g) => g.size === "minor")).toBe(false);
  });
});

describe("computeGraduations — day mode (about a week)", () => {
  it("majors at midnights with weekday labels, hour minors, 6h mids", () => {
    const gs = computeGraduations(START, START + 7 * DAY, 1100, "el"); // ~157 px/day
    const majors = gs.filter((g) => g.size === "major");
    expect(majors.length).toBeGreaterThanOrEqual(7);
    for (const m of majors) expect(m.sectionLabel).toMatch(/\d/); // "Σάβ 20"
    const mids = gs.filter((g) => g.size === "mid");
    expect(mids.length).toBeGreaterThan(0);
    for (const g of mids.slice(0, 5)) {
      expect(athensWallTime(START + g.fraction * 7 * DAY).hour % 6).toBe(0);
    }
    // 6h marks carry hour cell labels at this density.
    expect(mids.some((g) => g.cellLabel != null)).toBe(true);
  });
});

describe("computeGraduations — minute mode (hours-scale domains)", () => {
  it("majors at hours (HH:00 labels) with minute ticks between", () => {
    const gs = computeGraduations(START, START + 3 * HOUR, 900, "el"); // 300 px/hour
    const majors = gs.filter((g) => g.size === "major");
    expect(majors.length).toBeGreaterThanOrEqual(3);
    for (const m of majors) expect(m.sectionLabel).toMatch(/:\d{2}/);
    expect(gs.some((g) => g.size === "mid" || g.size === "minor")).toBe(true);
  });
});

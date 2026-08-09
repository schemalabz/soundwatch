import { describe, expect, it } from "vitest";
import { computeGraduations, graduationLevel } from "./graduations";
import { athensWallTime } from "./time";

const DAY = 86_400_000;
// Monday 2026-06-15 00:00 Athens (EEST = UTC+3).
const START = Date.UTC(2026, 5, 14, 21, 0, 0);

describe("graduationLevel", () => {
  const ninetyDays = 90 * DAY;
  it("affords days when wide, weeks when narrower, months when tight", () => {
    expect(graduationLevel(1200, ninetyDays)).toBe("day"); // 13.3 px/day
    expect(graduationLevel(400, ninetyDays)).toBe("week"); // 4.4 px/day, 31 px/week
    expect(graduationLevel(80, ninetyDays)).toBe("month"); // 6 px/week
  });
});

describe("computeGraduations", () => {
  it("marks Athens-local Mondays as weeks and month firsts as months", () => {
    const gs = computeGraduations(START, START + 30 * DAY, 1200, "el");
    const months = gs.filter((g) => g.level === "month");
    const weeks = gs.filter((g) => g.level === "week");
    expect(months).toHaveLength(1); // July 1 falls inside
    expect(months[0].label).toBeTruthy();
    expect(weeks.length).toBeGreaterThanOrEqual(3);
    for (const g of [...months, ...weeks]) {
      const w = athensWallTime(START + g.fraction * 30 * DAY);
      expect(w.hour).toBe(0); // true local midnight
    }
  });

  it("emits day ticks only at day level", () => {
    const wide = computeGraduations(START, START + 30 * DAY, 1200, "el");
    const narrow = computeGraduations(START, START + 30 * DAY, 150, "el");
    expect(wide.some((g) => g.level === "day")).toBe(true);
    expect(narrow.some((g) => g.level === "day")).toBe(false);
    // ~29 boundaries at day level (start day excluded, end open).
    expect(wide.length).toBeGreaterThanOrEqual(28);
  });
});

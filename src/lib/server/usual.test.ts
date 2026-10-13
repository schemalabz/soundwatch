import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { departureEpisodes, WINDOW_S, type FleetUsual, type TenMinuteWindow } from "./usual";
import {
  classify,
  countVersusUsual,
  dayTypeOf,
  fmtDelta,
  hasSupport,
  USUAL_DAYS,
  USUAL_MIN_BUCKETS,
  usualDelta,
  usualEdges,
  usualWindow,
} from "@/lib/dashboard/usual";

// Athens, October 2026: UTC+3 until the switch on the 25th, UTC+2 after.
const TUE_13_OCT_15_48 = Date.UTC(2026, 9, 13, 12, 48); // Tue 15:48 Athens
const SAT_10_OCT_09_48 = Date.UTC(2026, 9, 10, 6, 48); // Sat 09:48 Athens
const WED_28_OCT_01_30 = Date.UTC(2026, 9, 27, 23, 30); // Wed 01:30 Athens, UTC+2

describe("day type and window", () => {
  it("weekday / weekend by Athens wall time", () => {
    expect(dayTypeOf(TUE_13_OCT_15_48)).toBe("weekday");
    expect(dayTypeOf(SAT_10_OCT_09_48)).toBe("weekend");
    // 23:30 UTC on Tuesday is already Wednesday in Athens; still a weekday.
    expect(dayTypeOf(WED_28_OCT_01_30)).toBe("weekday");
    // Friday 22:30 UTC is Saturday 01:30 Athens: a weekend hour.
    expect(dayTypeOf(Date.UTC(2026, 9, 9, 22, 30))).toBe("weekend");
  });

  it("the band ends at the instant's Athens midnight and runs four weeks back", () => {
    const w = usualWindow(TUE_13_OCT_15_48);
    expect(w.hour).toBe(15);
    expect(w.dayType).toBe("weekday");
    expect(w.dayStartMs).toBe(Date.UTC(2026, 9, 12, 21)); // Tue 00:00 Athens = Mon 21:00 UTC
    expect(w.dayStartMs - w.fromMs).toBe(USUAL_DAYS * 86_400_000);
  });

  it("the day boundary follows Athens, not UTC, across the DST switch", () => {
    const w = usualWindow(WED_28_OCT_01_30);
    expect(w.hour).toBe(1);
    expect(w.dayStartMs).toBe(Date.UTC(2026, 9, 27, 22)); // Wed 00:00 Athens = Tue 22:00 UTC
  });
});

describe("the rule", () => {
  const band = { l90: 60, l50: 66, l10: 72, laeq: 67, n: 1000, buckets: 20 };
  it("fires on the band edge, inclusive of the edge itself", () => {
    expect(classify(72.1, band)).toBe("above");
    expect(classify(72, band)).toBe("inside");
    expect(classify(60, band)).toBe("inside");
    expect(classify(59.9, band)).toBe("below");
  });
  it("the pill number is the distance from the typical hour, whole dB", () => {
    expect(usualDelta(75.6, band)).toBe(10);
    expect(usualDelta(57.4, band)).toBe(-9);
    expect(usualDelta(66.4, band)).toBe(0);
  });
  it("a narrow band is widened to the floor around the typical level", () => {
    const narrow = { ...band, l90: 53, l50: 54, l10: 56 };
    expect(usualEdges(narrow)).toEqual({ lo: 51, hi: 57 });
    expect(classify(56.5, narrow)).toBe("inside");
    expect(classify(57.5, narrow)).toBe("above");
    // A wide band is left alone.
    expect(usualEdges(band)).toEqual({ lo: 60, hi: 72 });
  });
  it("the pill prints a real minus sign", () => {
    expect(fmtDelta(10)).toBe("+10");
    expect(fmtDelta(-4)).toBe("−4");
    expect(fmtDelta(0)).toBe("0");
  });
  it("support is counted in hour-buckets", () => {
    expect(hasSupport({ ...band, buckets: USUAL_MIN_BUCKETS })).toBe(true);
    expect(hasSupport({ ...band, buckets: USUAL_MIN_BUCKETS - 1 })).toBe(false);
    expect(hasSupport(null)).toBe(false);
    expect(hasSupport(undefined)).toBe(false);
  });
});

describe("counting a frame against the usual", () => {
  const band = { l90: 60, l50: 66, l10: 72, laeq: 67, n: 1000, buckets: 20 };
  it("splits measured places by verdict, and keeps the ones without history apart", () => {
    const frame = { a: { laeq: 80 }, b: { laeq: 66 }, c: { laeq: 50 }, d: { laeq: 70 }, z: { laeq: 99 } };
    const usual = { a: band, b: band, c: band, d: { ...band, buckets: 2 } };
    expect(countVersusUsual(["a", "b", "c", "d", "e"], frame, usual)).toEqual({
      measured: 4,
      above: 1,
      inside: 1,
      below: 1,
      noHistory: 1,
    });
  });
  it("counts nothing before the frame or the band arrive", () => {
    expect(countVersusUsual(["a"], null, null)).toEqual({ measured: 0, above: 0, below: 0, inside: 0, noHistory: 0 });
    expect(countVersusUsual(["a"], { a: { laeq: 70 } }, null).noHistory).toBe(1);
  });
});

describe("departure episodes", () => {
  // Tuesday 13 Oct, Athens day start = Mon 21:00 UTC.
  const day0 = Date.UTC(2026, 9, 12, 21);
  const t = (hour: number, minute: number) => day0 + (hour * 60 + minute) * 60_000;
  const band = (l90: number, l50: number, l10: number) => ({ l90, l50, l10, laeq: l50, n: 500, buckets: 12 });
  const usual: FleetUsual = new Map([
    [
      "kypseli",
      new Map([
        [5, band(47, 53, 69)],
        [10, band(66, 72, 77)],
        [15, band(65, 72, 78)],
      ]),
    ],
    ["peristeri", new Map([[10, band(53, 57, 65)]])],
  ]);
  const win = (sensorId: string, hour: number, minute: number, laeq: number): TenMinuteWindow => ({
    sensorId,
    tMs: t(hour, minute),
    laeq,
    n: 10,
  });

  it("merges consecutive windows into one episode with its peak and the band at the peak", () => {
    const episodes = departureEpisodes(
      [
        win("kypseli", 5, 0, 60), // inside
        win("kypseli", 5, 10, 72.7), // above: starts
        win("kypseli", 5, 20, 76.8), // above: the peak
        win("kypseli", 5, 30, 71), // above: continues
        win("kypseli", 5, 40, 60), // inside: ends
      ],
      usual,
      t(15, 48)
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      sensorId: "kypseli",
      startMs: t(5, 10),
      endMs: t(5, 40),
      peakLaeq: 76.8,
      peakAtMs: t(5, 20),
      verdict: "above",
      l10: 69,
      l50: 53,
      ongoing: false,
    });
  });

  it("a single missing window does not split an episode; a longer gap does", () => {
    const episodes = departureEpisodes(
      [win("kypseli", 10, 0, 80), win("kypseli", 10, 20, 81), win("kypseli", 10, 50, 82)],
      usual,
      t(15, 48)
    );
    expect(episodes.map((e) => [e.startMs, e.endMs])).toEqual([
      [t(10, 50), t(11, 0)],
      [t(10, 0), t(10, 30)],
    ]);
  });

  it("an hour without support never departs, and a change of verdict starts a new episode", () => {
    const episodes = departureEpisodes(
      [
        win("kypseli", 12, 0, 95), // hour 12 has no band: ignored
        win("peristeri", 10, 10, 75.4), // above
        win("peristeri", 10, 20, 40), // below: a different episode
      ],
      usual,
      t(15, 48)
    );
    expect(episodes.map((e) => [e.sensorId, e.verdict, e.peakLaeq])).toEqual([
      ["peristeri", "below", 40],
      ["peristeri", "above", 75.4],
    ]);
  });

  it("an episode touching the cut is ongoing, and the list is newest first", () => {
    const until = t(15, 48);
    const episodes = departureEpisodes(
      [win("peristeri", 10, 10, 75.4), win("kypseli", 15, 30, 82.3), win("kypseli", 15, 40, 82)],
      usual,
      until
    );
    expect(episodes.map((e) => [e.sensorId, e.ongoing])).toEqual([
      ["kypseli", true],
      ["peristeri", false],
    ]);
    expect(episodes[0].endMs).toBe(t(15, 40) + WINDOW_S * 1000);
  });

  it("a sensor the fleet map does not know is skipped", () => {
    expect(departureEpisodes([win("bench", 10, 0, 120)], usual, t(15, 48))).toEqual([]);
  });
});

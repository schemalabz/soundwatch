import { describe, expect, it } from "vitest";
import { FrameStore, frameKey, frameWindowS, quantizeFrameMs, upcomingFrameTimes } from "./frames";
import { levelColor, levelScale, DEFAULT_STOPS, audibleRadiusM, metersPerPixel } from "./levels";

const HOUR = 3_600_000;

describe("frame keys and windows", () => {
  it("quantizes to the minute so playback and prefetch agree", () => {
    expect(frameKey(1_786_000_000_123, 600, "laeq")).toBe(frameKey(1_786_000_000_999, 600, "laeq"));
    expect(frameKey(1_786_000_000_123, 600, "laeq")).not.toBe(frameKey(1_786_000_000_123, 600, "l10"));
    expect(quantizeFrameMs(1_786_000_059_999)).toBe(1_786_000_020_000);
  });

  it("window tracks the step but never drops below 5 minutes", () => {
    expect(frameWindowS(60_000)).toBe(300);
    expect(frameWindowS(6 * HOUR)).toBe(21_600);
  });
});

describe("upcomingFrameTimes", () => {
  const segs = [
    { startMs: 0, endMs: 10 * HOUR },
    { startMs: 24 * HOUR, endMs: 30 * HOUR },
  ];

  it("walks the gap-skipping playback path", () => {
    const times = upcomingFrameTimes(segs, 8 * HOUR, HOUR, 4);
    expect(times).toEqual([8 * HOUR, 9 * HOUR, 10 * HOUR + 14 * HOUR, 25 * HOUR]);
  });

  it("stops at the end of the selection", () => {
    const times = upcomingFrameTimes(segs, 29 * HOUR, HOUR, 5);
    expect(times).toEqual([29 * HOUR]); // 30h is the exclusive end
  });
});

describe("FrameStore", () => {
  it("dedupes in-flight fetches via pending markers", () => {
    const store = new FrameStore();
    store.markPending("a");
    expect(store.has("a")).toBe(true);
    expect(store.get("a")).toBeUndefined();
    store.set("a", { s1: { laeq: 60, n: 5 } });
    expect(store.get("a")?.s1.laeq).toBe(60);
  });

  it("clears pending on failure so retries can happen", () => {
    const store = new FrameStore();
    store.markPending("a");
    store.clearPending("a");
    expect(store.has("a")).toBe(false);
  });

  it("evicts oldest resolved frames beyond the cap, never pendings", () => {
    const store = new FrameStore();
    store.markPending("inflight");
    for (let i = 0; i < 60; i++) store.set(`k${i}`, {});
    expect(store.get("k0")).toBeUndefined(); // oldest evicted
    expect(store.get("k59")).toBeDefined();
    expect(store.has("inflight")).toBe(true); // pending survives
    expect(store.size).toBeLessThanOrEqual(49 + 1);
  });
});

describe("level encoding", () => {
  // Anchored to DEFAULT_STOPS rather than to literal dB values: the stops are
  // arbitrary visual thresholds and get retuned when the fleet's range moves
  // (it did, when firmware 1.1 lifted the ~68 dB clamp). What must hold is the
  // encoding's behaviour, not the numbers it happens to use today.
  const [quiet, sound, loud] = DEFAULT_STOPS.colors;
  const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

  it("interpolates color between stops and clamps at the ends", () => {
    expect(levelColor(quiet[0] - 10, DEFAULT_STOPS)).toBe(rgb(quiet[1]));
    expect(levelColor(loud[0] + 10, DEFAULT_STOPS)).toBe(rgb(loud[1]));
    const midDb = (quiet[0] + sound[0]) / 2;
    expect(levelColor(midDb, DEFAULT_STOPS)).toBe(
      `rgb(${Math.round((quiet[1][0] + sound[1][0]) / 2)},${Math.round((quiet[1][1] + sound[1][1]) / 2)},${Math.round((quiet[1][2] + sound[1][2]) / 2)})`
    );
  });

  it("scales monotonically with level", () => {
    expect(levelScale(DEFAULT_STOPS.minDb - 5)).toBe(DEFAULT_STOPS.minScale);
    expect(levelScale(DEFAULT_STOPS.maxDb)).toBeCloseTo(DEFAULT_STOPS.maxScale, 10);
    expect(levelScale(DEFAULT_STOPS.maxDb + 20)).toBeCloseTo(DEFAULT_STOPS.maxScale, 10);
    expect(levelScale(70)).toBeGreaterThan(levelScale(50));
  });

  it("audible radius follows inverse-square: 6 dB doubles the reach", () => {
    // Spherical spreading: distance ratio is 10^(Δ/20), so a doubling is
    // 20·log10(2) = 6.02 dB — "6 dB per doubling" is the shorthand, not the
    // identity. This ratio is the honest part of the circles; the anchor is
    // not, because the scale is uncalibrated.
    const DOUBLING_DB = 20 * Math.log10(2);
    expect(audibleRadiusM(60 + DOUBLING_DB) / audibleRadiusM(60)).toBeCloseTo(2, 6);
    expect(audibleRadiusM(60 + 2 * DOUBLING_DB) / audibleRadiusM(60)).toBeCloseTo(4, 6);
    // The shorthand is close, and knowing how close is the point.
    expect(audibleRadiusM(66) / audibleRadiusM(60)).toBeCloseTo(1.995, 3);
    // Monotonic between the clamps.
    for (let db = 45; db < 85; db += 5) {
      expect(audibleRadiusM(db + 5)).toBeGreaterThan(audibleRadiusM(db));
    }
    // Clamped at both ends: a silent sensor stays clickable, a loud one does
    // not swallow the city.
    expect(audibleRadiusM(-50)).toBe(audibleRadiusM(0));
    expect(audibleRadiusM(200)).toBe(audibleRadiusM(150));
  });

  it("metres-per-pixel halves with each zoom level", () => {
    expect(metersPerPixel(38, 12) / metersPerPixel(38, 13)).toBeCloseTo(2, 6);
    // Mercator: a degree of longitude is shorter away from the equator.
    expect(metersPerPixel(60, 12)).toBeLessThan(metersPerPixel(0, 12));
  });

  it("covers the range firmware 1.1 actually produces (33.8 - 97.7 device-dB)", () => {
    // The old 42/62/82 + maxDb 88 anchors saturated here: every level above 82
    // was the same red at the same size.
    expect(levelColor(97.7, DEFAULT_STOPS)).not.toBe(levelColor(85, DEFAULT_STOPS));
    expect(levelScale(97.7)).toBeGreaterThan(levelScale(85));
    expect(levelScale(33.8)).toBe(DEFAULT_STOPS.minScale);
  });
});

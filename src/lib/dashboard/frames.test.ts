import { describe, expect, it } from "vitest";
import { FrameStore, frameKey, frameWindowS, quantizeFrameMs, upcomingFrameTimes } from "./frames";
import { levelColor, levelScale, DEFAULT_STOPS } from "./levels";

const HOUR = 3_600_000;

describe("frame keys and windows", () => {
  it("quantizes to the minute so playback and prefetch agree", () => {
    expect(frameKey(1_786_000_000_123, 600)).toBe(frameKey(1_786_000_000_999, 600));
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
  it("interpolates color between stops and clamps at the ends", () => {
    expect(levelColor(30, DEFAULT_STOPS)).toBe("rgb(79,93,117)");
    expect(levelColor(95, DEFAULT_STOPS)).toBe("rgb(179,54,42)");
    const mid = levelColor(52, DEFAULT_STOPS); // halfway quiet->sound
    expect(mid).toBe(`rgb(${Math.round((79 + 239) / 2)},${Math.round((93 + 131) / 2)},${Math.round((117 + 84) / 2)})`);
  });

  it("scales monotonically with level", () => {
    expect(levelScale(30)).toBe(DEFAULT_STOPS.minScale);
    expect(levelScale(95)).toBeCloseTo(DEFAULT_STOPS.maxScale, 10);
    expect(levelScale(70)).toBeGreaterThan(levelScale(50));
  });
});

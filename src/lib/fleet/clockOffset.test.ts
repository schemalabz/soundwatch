import { describe, expect, it } from "vitest";

import {
  CLOCK_CARRY_MS,
  CLOCK_DRIFT_CAP_MS,
  CLOCK_WINDOW_MS,
  correctClock,
  emptyClockState,
  hourShift,
  type ClockState,
} from "./clockOffset";

const T0 = Date.parse("2026-10-01T10:00:00Z");
const MIN = 60_000;
const S = 1000;

/** A row measured at true time `trueMs`, by a clock `errMs` off, delivered `delayMs` later. */
function feed(state: ClockState, trueMs: number, errMs: number, delayMs = 300) {
  return correctClock(state, { recordedAt: new Date(trueMs + errMs), receivedAt: new Date(trueMs + delayMs) });
}

/** n live rows, 30 s apart, starting at `fromMs`. Returns the last correction. */
function live(state: ClockState, fromMs: number, n: number, errMs: number) {
  let out = feed(state, fromMs, errMs);
  for (let i = 1; i < n; i++) out = feed(state, fromMs + i * 30 * S, errMs, 300 + (i % 3) * 400);
  return out;
}

describe("hourShift", () => {
  it("is the hour difference, not the time difference", () => {
    expect(hourShift(Date.parse("2026-10-01T10:03:00Z"), Date.parse("2026-10-01T09:58:00Z"))).toBe(-1);
    expect(hourShift(Date.parse("2026-10-01T10:30:00Z"), Date.parse("2026-10-01T10:25:00Z"))).toBe(0);
    expect(hourShift(Date.parse("2026-10-01T09:58:00Z"), Date.parse("2026-10-01T10:03:00Z"))).toBe(1);
  });
});

describe("correctClock", () => {
  it("leaves a row uncorrected when nothing is known", () => {
    const out = feed(emptyClockState(), T0, 2 * 3600_000); // 2 h fast: beyond the cap
    expect(out).toEqual({ offsetMs: null, correctedAt: null, hourShift: 0 });
  });

  it("measures a fast clock from live rows and moves the reading back into its hour", () => {
    const s = emptyClockState();
    live(s, T0 - 30 * MIN, 50, 5.5 * MIN); // the issue's median: +330 s
    // Sound at 10:57:00 true, stamped 11:02:30 by the device.
    const out = feed(s, T0 + 57 * MIN, 5.5 * MIN);
    expect(out.offsetMs).toBe(5.5 * MIN - 300); // minus the smallest delay seen
    expect(out.hourShift).toBe(-1);
    expect(Math.abs(out.correctedAt!.getTime() - (T0 + 57 * MIN))).toBeLessThan(2 * S);
  });

  it("corrects a slow clock forward", () => {
    const s = emptyClockState();
    live(s, T0, 20, -4 * MIN);
    const out = feed(s, T0 + 62 * MIN, -4 * MIN); // stamped 10:58, really 11:02
    expect(out.hourShift).toBe(1);
  });

  it("does not let a replay drag the estimate: replays only lower d", () => {
    const s = emptyClockState();
    live(s, T0, 40, 6 * MIN);
    // A row from 10:05 replayed now, 20 min late: d = +6 min - 20 min = -14 min, inside the cap.
    const replay = feed(s, T0 + 5 * MIN, 6 * MIN, 20 * MIN + 40 * 30 * S);
    expect(replay.offsetMs).toBeCloseTo(6 * MIN - 300, -3);
    // ... and the next live row still sees the live estimate.
    const next = feed(s, T0 + 40 * 30 * S + 30 * S, 6 * MIN);
    expect(next.offsetMs).toBeCloseTo(6 * MIN - 300, -3);
  });

  it("corrects a backlog with the error measured around it, not with its own d", () => {
    const s = emptyClockState();
    live(s, T0, 20, 8 * MIN);
    // Offline for 5 h, then the flash flushes in a burst, 200 ms apart.
    const back = T0 + 5 * 3600_000;
    const outs = [];
    for (let i = 0; i < 30; i++) {
      outs.push(
        correctClock(s, {
          recordedAt: new Date(T0 + 10 * MIN + i * 30 * S + 8 * MIN),
          receivedAt: new Date(back + i * 200),
        })
      );
    }
    for (const o of outs) expect(o.offsetMs).toBeCloseTo(8 * MIN - 300, -3);
  });

  it("does not take a burst row as live even when it is inside the cap", () => {
    const s = emptyClockState();
    live(s, T0, 20, 3 * MIN);
    // 2 h outage; the last minutes of the backlog are only ~10 min late, so
    // their d (3 - 10 = -7 min) passes the cap. They arrive as a burst.
    const back = T0 + 3 * 3600_000;
    let last = null;
    for (let i = 0; i < 10; i++) {
      last = correctClock(s, {
        recordedAt: new Date(back - 10 * MIN + i * 30 * S + 3 * MIN),
        receivedAt: new Date(back + i * 100),
      });
    }
    expect(last!.offsetMs).toBeCloseTo(3 * MIN - 300, -3);
  });

  it("follows a resync (NTP or reboot) once three live rows agree on it", () => {
    const s = emptyClockState();
    live(s, T0, 60, 20 * MIN); // 20 min fast
    const t = T0 + 60 * 30 * S + 2 * MIN; // reboot gap, then the clock is right
    expect(feed(s, t, 0).offsetMs).toBeCloseTo(20 * MIN - 300, -3); // could still be a backlog
    expect(feed(s, t + 30 * S, 0).offsetMs).toBeCloseTo(20 * MIN - 300, -3);
    const third = feed(s, t + 60 * S, 0);
    expect(third.offsetMs).toBe(-300);
    expect(third.hourShift).toBe(0);
  });

  it("does not take replays drained at live cadence for a resync", () => {
    const s = emptyClockState();
    live(s, T0, 20, 10 * MIN);
    // A backlog drained one row per 30 s, 25 min late, interleaved with live rows.
    let t = T0 + 20 * 30 * S;
    for (let i = 0; i < 10; i++, t += 30 * S) {
      const replay = feed(s, t - 25 * MIN, 10 * MIN, 25 * MIN);
      expect(replay.offsetMs).toBeCloseTo(10 * MIN - 300, -3);
      t += 30 * S;
      feed(s, t, 10 * MIN);
    }
  });

  it("carries the last estimate over an empty window, but not forever", () => {
    const s = emptyClockState();
    live(s, T0, 10, 7 * MIN);
    const late = (afterMs: number) =>
      correctClock(s, { recordedAt: new Date(T0 + 7 * MIN), receivedAt: new Date(T0 + afterMs) });
    expect(late(CLOCK_WINDOW_MS + 3600_000).offsetMs).toBeCloseTo(7 * MIN - 300, -3);
    expect(late(CLOCK_CARRY_MS + 3600_000).offsetMs).toBeNull();
  });

  it("never corrects by more than the cap, so the hour shift is -1, 0 or +1", () => {
    const s = emptyClockState();
    for (let i = 0; i < 2000; i++) {
      const err = ((i * 7919) % (2 * CLOCK_DRIFT_CAP_MS + 1)) - CLOCK_DRIFT_CAP_MS;
      const out = feed(s, T0 + i * 31 * S, err, (i * 104729) % (6 * 3600_000));
      if (out.offsetMs != null) expect(Math.abs(out.offsetMs)).toBeLessThanOrEqual(CLOCK_DRIFT_CAP_MS);
      expect([-1, 0, 1]).toContain(out.hourShift);
    }
  });
});

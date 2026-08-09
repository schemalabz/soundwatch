import { describe, expect, it } from "vitest";
import { FLEET } from "./fleet";
import { isOnline, lastOutageEndBefore, MAX_OUTAGE_S, MIN_OUTAGE_S } from "./outages";

const T0 = Date.UTC(2026, 5, 16, 0, 0, 0) / 1000;
const DAY = 86400;

describe("outage model", () => {
  it("is deterministic", () => {
    for (const s of FLEET.slice(0, 10)) {
      for (let k = 0; k < 50; k++) {
        const t = T0 + k * 7013;
        expect(isOnline(s.deviceId, t)).toBe(isOnline(s.deviceId, t));
      }
    }
  });

  it("keeps most of the fleet online at any moment", () => {
    // Sample 60 instants over 90 days; the fleet-wide online fraction should
    // hover in the ~88-100% band ("most of them should be online").
    let online = 0;
    let total = 0;
    for (let k = 0; k < 60; k++) {
      const t = T0 + k * 1.5 * DAY;
      for (const s of FLEET) {
        total++;
        if (isOnline(s.deviceId, t)) online++;
      }
    }
    const fraction = online / total;
    expect(fraction).toBeGreaterThan(0.85);
    expect(fraction).toBeLessThanOrEqual(1);
    // ...but outages must actually happen.
    expect(fraction).toBeLessThan(0.9999);
  });

  it("gives every sensor a mostly-online life, with some flaky units", () => {
    const uptimes = FLEET.map((s) => {
      let online = 0;
      const samples = 200;
      for (let k = 0; k < samples; k++) {
        if (isOnline(s.deviceId, T0 + k * (90 / samples) * DAY)) online++;
      }
      return online / samples;
    });
    for (const u of uptimes) expect(u).toBeGreaterThan(0.5);
    const mean = uptimes.reduce((a, b) => a + b, 0) / uptimes.length;
    expect(mean).toBeGreaterThan(0.9); // fleet-wide: mostly online
    expect(uptimes.filter((u) => u > 0.9).length).toBeGreaterThanOrEqual(40); // solid majority
    expect(uptimes.some((u) => u < 0.95)).toBe(true); // problem children exist
  });

  it("bounds outage durations to [1 min, 10 days]", () => {
    // Walk minute-by-minute over 120 days for a handful of sensors and
    // measure each contiguous dark stretch.
    for (const s of FLEET.slice(0, 8)) {
      let darkSince: number | null = null;
      for (let t = T0; t < T0 + 120 * DAY; t += 60) {
        const on = isOnline(s.deviceId, t);
        if (!on && darkSince == null) darkSince = t;
        if (on && darkSince != null) {
          const dur = t - darkSince;
          expect(dur).toBeGreaterThanOrEqual(MIN_OUTAGE_S);
          // Overlapping outages can chain; allow twice the single-outage cap.
          expect(dur).toBeLessThanOrEqual(2 * MAX_OUTAGE_S);
          darkSince = null;
        }
      }
    }
  });

  it("reports a recovery time consistent with the outage that ended", () => {
    // Find an outage end via scanning, then lastOutageEndBefore must match.
    outer: for (const s of FLEET) {
      let wasOnline = isOnline(s.deviceId, T0);
      for (let t = T0 + 60; t < T0 + 120 * DAY; t += 60) {
        const on = isOnline(s.deviceId, t);
        if (on && !wasOnline) {
          const end = lastOutageEndBefore(s.deviceId, t);
          expect(end).not.toBeNull();
          expect(end!).toBeGreaterThan(t - 120);
          expect(end!).toBeLessThanOrEqual(t);
          break outer;
        }
        wasOnline = on;
      }
    }
  });
});

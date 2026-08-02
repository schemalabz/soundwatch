import { describe, it, expect } from "vitest";
import { computeFlavor1, FRAMES_PER_SEC_REALTIME } from "./flavor1";
import { parseSensorPayload, type ParsedReading } from "./parser";

// A Flavor 1 payload: stock env ids (temp/humidity) + accumulator ids 235-240.
const F1_PAYLOAD =
  "{t:2026-07-29T10:00:00Z,55:30.0,56:41.0," +
  "235:1,236:1000000000,237:2400,238:60,239:600000,240:200000}";

describe("computeFlavor1", () => {
  it("computes LAeq = 10*log10(energy_sum/frame_count) + offset", () => {
    // 10*log10(1e9/2400) = 10*log10(416666.67) ≈ 56.198
    const c = computeFlavor1({ energySum: 1e9, frameCount: 2400, intervalS: 60, maxEnergy: 6e5, minEnergy: 2e5 })!;
    expect(c.laeq).toBeCloseTo(56.198, 2);
  });

  it("computes realized_duty = frame_count / (86.13 * interval_s)", () => {
    // 2400 / (86.1328 * 60) ≈ 0.4644
    const c = computeFlavor1({ energySum: 1e9, frameCount: 2400, intervalS: 60, maxEnergy: 6e5, minEnergy: 2e5 })!;
    expect(c.realizedDuty).toBeCloseTo(2400 / (FRAMES_PER_SEC_REALTIME * 60), 4);
    expect(c.realizedDuty).toBeCloseTo(0.4644, 3);
  });

  it("computes Lmax/Lmin est from per-frame max/min energy", () => {
    const c = computeFlavor1({ energySum: 1e9, frameCount: 2400, intervalS: 60, maxEnergy: 6e5, minEnergy: 2e5 })!;
    expect(c.lmaxEst).toBeCloseTo(10 * Math.log10(6e5), 3);
    expect(c.lminEst).toBeCloseTo(10 * Math.log10(2e5), 3);
    // max energy >= mean energy per frame >= min energy → Lmax >= LAeq >= Lmin
    expect(c.lmaxEst!).toBeGreaterThanOrEqual(c.laeq!);
    expect(c.laeq!).toBeGreaterThanOrEqual(c.lminEst!);
  });

  it("returns null when there is no Flavor 1 accumulator data (stock-only payload)", () => {
    expect(computeFlavor1({ energySum: null, frameCount: null })).toBeNull();
  });

  it("guards divide-by-zero / non-positive (no frames yet)", () => {
    const c = computeFlavor1({ energySum: 0, frameCount: 0, intervalS: 0, maxEnergy: 0, minEnergy: 0 })!;
    expect(c.laeq).toBeNull();
    expect(c.realizedDuty).toBeNull();
    expect(c.lmaxEst).toBeNull();
    expect(c.lminEst).toBeNull();
  });
});

describe("parseSensorPayload — Flavor 1 accumulator ids", () => {
  it("extracts ids 235-240 into the Flavor 1 fields", () => {
    const r = parseSensorPayload(F1_PAYLOAD) as ParsedReading;
    expect(r).not.toBeNull();
    expect(r.payloadVersion).toBe(1); // 235
    expect(r.energySum).toBe(1000000000); // 236
    expect(r.frameCount).toBe(2400); // 237
    expect(r.intervalS).toBe(60); // 238
    expect(r.maxEnergy).toBe(600000); // 239
    expect(r.minEnergy).toBe(200000); // 240
    // stock ids still parsed alongside
    expect(r.temperature).toBe(30.0); // 55
    expect(r.humidity).toBe(41.0); // 56
  });

  it("leaves Flavor 1 fields null on a stock-only payload", () => {
    const r = parseSensorPayload("{t:2026-07-29T10:00:00Z,53:50.0,55:30.0}") as ParsedReading;
    expect(r.energySum).toBeNull();
    expect(r.frameCount).toBeNull();
  });
});

describe("payload v3: millisecond intervals", () => {
  it("computes duty from exact ms and differs from the truncated-seconds result", () => {
    // bench4 real row: 1240 frames over a true 55.9s reported (v2) as 55s.
    const v3 = computeFlavor1({ energySum: 1e9, frameCount: 1240, intervalMs: 55900 });
    const v2 = computeFlavor1({ energySum: 1e9, frameCount: 1240, intervalS: 55 });
    expect(v3?.realizedDuty).toBeCloseTo(1240 / ((44100 / 512) * 55.9), 8);
    expect(v2?.realizedDuty).toBeCloseTo(1240 / ((44100 / 512) * 55), 8);
    expect(v3!.realizedDuty!).toBeLessThan(v2!.realizedDuty!);
  });

  it("prefers ms over seconds when both are present", () => {
    const c = computeFlavor1({ energySum: 1e9, frameCount: 100, intervalS: 27, intervalMs: 27400 });
    expect(c?.realizedDuty).toBeCloseTo(100 / ((44100 / 512) * 27.4), 8);
  });
});

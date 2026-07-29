import { describe, it, expect } from "vitest";
import {
  computePercentiles,
  decodeBandsDb,
  HIST_BIN_DB,
  HIST_MIN_DB,
  HIST_BINS,
} from "./flavor2";
import { parseSensorPayload, type ParsedReading } from "./parser";

// Build a packed histogram string from a sparse {binIndex: count} spec.
function hist(spec: Record<number, number>): string {
  const bins = Array(HIST_BINS).fill(0);
  for (const [i, c] of Object.entries(spec)) bins[Number(i)] = c;
  return bins.join("-");
}

describe("computePercentiles (L10/L50/L90 from the level histogram)", () => {
  // Bin i covers [30+2i, 30+2(i+1)) device-dB.
  it("computes exceedance levels with interpolation across known bins", () => {
    // 25 frames in bin 10 [50,52), 50 in bin 12 [54,56), 25 in bin 14 [58,60)
    const p = computePercentiles(hist({ 10: 25, 12: 50, 14: 25 }))!;
    expect(p.l90).toBeCloseTo(50.8, 3); // exceeded 90% of the time (10th pct)
    expect(p.l50).toBeCloseTo(55.0, 3); // median
    expect(p.l10).toBeCloseTo(59.2, 3); // exceeded 10% of the time (90th pct)
    expect(p.l10).toBeGreaterThanOrEqual(p.l50);
    expect(p.l50).toBeGreaterThanOrEqual(p.l90);
  });

  it("handles a single-bin distribution", () => {
    const p = computePercentiles(hist({ 14: 100 }))!;
    // all inside [58,60): L90=58.2, L50=59.0, L10=59.8
    expect(p.l90).toBeCloseTo(58.2, 3);
    expect(p.l50).toBeCloseTo(59.0, 3);
    expect(p.l10).toBeCloseTo(59.8, 3);
  });

  it("returns null for an empty histogram (no frames)", () => {
    expect(computePercentiles(hist({}))).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(computePercentiles("not-numbers-at-all-x")).toBeNull();
    expect(computePercentiles("")).toBeNull();
  });

  it("bin geometry constants are consistent", () => {
    expect(HIST_MIN_DB + HIST_BINS * HIST_BIN_DB).toBe(90); // 30 + 30*2
  });
});

describe("decodeBandsDb", () => {
  it("decodes dB*10 ints to dB floats, 0 -> null (silent band)", () => {
    expect(decodeBandsDb("583-541-0-620")).toEqual([58.3, 54.1, null, 62.0]);
  });
  it("returns null for malformed input", () => {
    expect(decodeBandsDb("x-y")).toBeNull();
    expect(decodeBandsDb("")).toBeNull();
  });
});

describe("parseSensorPayload — Flavor 2 packed ids", () => {
  const PAYLOAD =
    "{t:2026-07-30T10:00:00Z,55:30.0,235:2,236:1000000000,237:2400,238:30," +
    "241:0-0-12-500-88-0,242:583-541-620}";

  it("extracts ids 241/242 as raw packed strings", () => {
    const r = parseSensorPayload(PAYLOAD) as ParsedReading;
    expect(r).not.toBeNull();
    expect(r.histRaw).toBe("0-0-12-500-88-0");
    expect(r.bandsRaw).toBe("583-541-620");
    expect(r.payloadVersion).toBe(2);
    expect(r.energySum).toBe(1000000000); // Flavor 1 fields still parsed
  });

  it("leaves them null on a Flavor 1 / stock payload", () => {
    const r = parseSensorPayload("{t:2026-07-30T10:00:00Z,53:50.0}") as ParsedReading;
    expect(r.histRaw).toBeNull();
    expect(r.bandsRaw).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { BIN_COUNT, BIN_HI, BIN_LO, BinAccumulator, binLow } from "./levelBins";
import { CAGG_BINS } from "../../../scripts/timescale-objects";

describe("level bins", () => {
  it("the cagg SQL and the TS consumers agree on the bin scheme", () => {
    expect(CAGG_BINS.lo).toBe(BIN_LO);
    expect(CAGG_BINS.hi).toBe(BIN_HI);
    expect(CAGG_BINS.count).toBe(BIN_COUNT);
  });

  it("binLow maps under/overflow to the edges", () => {
    expect(binLow(0)).toBe(BIN_LO - 1);
    expect(binLow(1)).toBe(BIN_LO);
    expect(binLow(BIN_COUNT)).toBe(BIN_HI - 1);
    expect(binLow(BIN_COUNT + 1)).toBe(BIN_HI);
  });

  it("accumulator recovers exact energy mean and interpolated percentiles", () => {
    const acc = new BinAccumulator();
    // 100 readings at 50 dB (bin 21), 100 at 60 dB (bin 31).
    acc.add({ bin: 21, n: 100, energy: 100 * Math.pow(10, 5), lmax: 55 });
    acc.add({ bin: 31, n: 100, energy: 100 * Math.pow(10, 6), lmax: 72 });
    const out = acc.out();
    expect(out.n).toBe(200);
    expect(out.laeq).toBeCloseTo(10 * Math.log10((1e5 + 1e6) / 2), 6);
    expect(out.lmax).toBe(72);
    // Median falls on the boundary between the two bins: rank 100 lands at
    // the top of bin 21 -> 51 dB.
    expect(out.l50).toBeCloseTo(51, 5);
    expect(out.l90).toBeGreaterThanOrEqual(50);
    expect(out.l10).toBeLessThanOrEqual(61);
  });
});

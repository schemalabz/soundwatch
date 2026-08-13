import { describe, expect, it } from "vitest";
import { BIN_COUNT, BIN_HI, BIN_LO, BinAccumulator, binLow } from "./levelBins";
import { CAGG_BINS, CAGG_SQL, stampFor } from "../../../scripts/timescale-objects";

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

describe("continuous-aggregate drift stamp", () => {
  // The stamp used to hold three numbers — the bin bounds — so it guarded the
  // bin bounds and nothing else. Every other part of the view could change
  // while the stamp stayed identical, CREATE ... IF NOT EXISTS would no-op,
  // and a stale aggregate shipped silently. These two mutations were tried
  // against the whole suite before the fix; neither failed anything.
  const MUTATIONS: [string, string, string][] = [
    ["bucket width", "time_bucket('1 hour'", "time_bucket('30 minutes'"],
    ["lmax fallback", "max(COALESCE(lmax_est, laeq))", "max(laeq)"],
    ["bin ceiling", `${CAGG_BINS.lo}, ${CAGG_BINS.hi}`, `${CAGG_BINS.lo}, 91`],
    ["energy expression", "power(10, laeq / 10)", "power(10, laeq / 20)"],
  ];

  for (const [what, from, to] of MUTATIONS) {
    it(`changes when the ${what} changes`, () => {
      expect(CAGG_SQL, `"${from}" is no longer in the view definition`).toContain(from);
      expect(stampFor(CAGG_SQL.replace(from, to))).not.toBe(stampFor(CAGG_SQL));
    });
  }

  it("is stable for an unchanged definition", () => {
    expect(stampFor(CAGG_SQL)).toBe(stampFor(CAGG_SQL));
  });
});

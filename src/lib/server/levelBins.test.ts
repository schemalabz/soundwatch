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
    // Exact, not one-sided. These bounds used to be >= 50 and <= 61, which
    // both quantiles satisfy no matter which quantile they are: swapping
    // l10 to percentile(0.1), or l90 to percentile(0.5), failed nothing.
    //
    // With 100 in bin 21 [50,51) and 100 in bin 31 [60,61):
    //   l90 = percentile(0.1) -> rank 20, one fifth into bin 21 -> 50.2
    //   l10 = percentile(0.9) -> rank 180, four fifths into bin 31 -> 60.8
    expect(out.l90).toBeCloseTo(50.2, 5);
    expect(out.l10).toBeCloseTo(60.8, 5);
  });
});

describe("the bin ceiling clears the fleet", () => {
  // Raising BIN_HI from 91 to 128 is the main data correction on this branch:
  // at 91 every interval above it fell into the overflow bin and binLow()
  // returned 91, so our own aggregate reproduced the firmware clamp that
  // release 1.1 had just removed. Reverting BOTH copies of the constant left
  // the whole suite green — levelBins.test.ts pinned the two copies to each
  // other, never to reality, so the exact regression could return in silence.
  //
  // Anchored to a measurement, not to a preference: 97.7 device-dB is the
  // loudest interval the fleet has produced since 1.1.
  const FLEET_MAX_OBSERVED_DB = 97.7;

  it("is above the loudest level the fleet has produced", () => {
    expect(BIN_HI).toBeGreaterThan(FLEET_MAX_OBSERVED_DB);
    expect(CAGG_BINS.hi).toBeGreaterThan(FLEET_MAX_OBSERVED_DB);
  });

  it("does not clamp a level the fleet can reach", () => {
    // binLow of the top real bin must sit above the fleet max, or a loud
    // interval lands in overflow and every percentile reading it is wrong.
    expect(binLow(BIN_COUNT)).toBeGreaterThan(FLEET_MAX_OBSERVED_DB);
  });

  it("keeps 1-dB bins", () => {
    expect(BIN_COUNT).toBe(BIN_HI - BIN_LO);
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

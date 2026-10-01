import { describe, it, expect } from "vitest";
import {
  computePercentiles,
  decodeBandsDb,
  HIST_BIN_DB,
  HIST_MIN_DB,
  HIST_BINS,
  HIST_V5_BINS,
  decodeHist,
} from "./flavor2";
import { deriveCensoring, parseHist } from "../src/lib/api/readings";
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

// Firmware 1.2 (payload v5) packing, ported line-for-line from
// SckUrban.cpp::finalize(): trim to the non-empty span, prefix first bin and
// width, fall back to 4 dB bins when the string would outgrow 88 chars.
function packV5(bins: number[]): string {
  let first = -1, last = -1;
  bins.forEach((c, i) => { if (c) { if (first < 0) first = i; last = i; } });
  if (first < 0) return "0";
  let h = "";
  for (let w = 1; w <= 2; w++) {
    h = `${first}-${w}`;
    for (let i = first; i <= last; i += w) {
      let c = bins[i];
      if (w === 2 && i + 1 <= last) c += bins[i + 1];
      h += `-${c}`;
    }
    if (h.length <= 88) break;
  }
  return h;
}
function grid(spec: Record<number, number>): number[] {
  const bins = Array(HIST_V5_BINS).fill(0);
  for (const [i, c] of Object.entries(spec)) bins[Number(i)] = c;
  return bins;
}

describe("v5 sparse histogram (firmware 1.2)", () => {
  it("reads the same percentiles as v4 for an interval inside 30-90 dB", () => {
    // v4 bin i = [30+2i); v5 grid bin j = [20+2j) — so v5 j = v4 i + 5.
    const v4 = hist({ 10: 25, 12: 50, 14: 25 });
    const v5 = packV5(grid({ 15: 25, 17: 50, 19: 25 }));
    expect(v5).toBe("15-1-25-0-50-0-25");
    const a = computePercentiles(v4, 4)!;
    const b = computePercentiles(v5, 5)!;
    expect(b.l10).toBeCloseTo(a.l10, 6);
    expect(b.l50).toBeCloseTo(a.l50, 6);
    expect(b.l90).toBeCloseTo(a.l90, 6);
  });

  it("resolves a loud interval that v4 pinned at 88-90", () => {
    // 70% of frames around 60 dB, 30% at 94-96 dB — construction next door.
    const v5 = packV5(grid({ 20: 70, 37: 30 }));
    const p = computePercentiles(v5, 5)!;
    expect(p.l10).toBeGreaterThan(94);
    expect(p.l10).toBeLessThan(96);
    const c = deriveCensoring(v5, 5)!;
    expect(c.topBinCensored).toBe(false);
  });

  it("marks only the true grid edges as censored", () => {
    expect(deriveCensoring(packV5(grid({ 0: 5, 10: 5 })), 5)).toEqual({ topBinCensored: false, bottomBinCensored: true });
    expect(deriveCensoring(packV5(grid({ 40: 5, 54: 5 })), 5)).toEqual({ topBinCensored: true, bottomBinCensored: false });
  });

  it("decodes the 4 dB fallback", () => {
    // Every bin from 0 to 54 populated (1,650 frames, a long interval spread
    // over 110 dB — far wider than any real one): too long at 2 dB, fits at 4.
    const bins = Array.from({ length: HIST_V5_BINS }, () => 30);
    const s = packV5(bins);
    expect(s.startsWith("0-2-")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(88);
    const h = decodeHist(s, 5)!;
    expect(h.binDb).toBe(4);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(30 * HIST_V5_BINS);
    const p = computePercentiles(s, 5)!;
    expect(p.l50).toBeCloseTo(75, 0); // uniform 20-130 → median 75
  });

  it("treats '0' as an empty interval and rejects off-grid spans", () => {
    expect(computePercentiles("0", 5)).toBeNull();
    expect(decodeHist("50-1-1-1-1-1-1-1", 5)).toBeNull(); // bins 50..54 then 55
    expect(decodeHist("3-3-1-1", 5)).toBeNull(); // unknown width
  });

  it("never reads a v5 string as the dense v4 layout, even at 30 elements", () => {
    const bins = grid(Object.fromEntries(Array.from({ length: 28 }, (_, k) => [10 + k, 1])));
    const s = packV5(bins);
    expect(s.split("-").length).toBe(30);
    expect(parseHist(s, 5)).toBeNull();
    expect(computePercentiles(s, 5)!.l50).toBeCloseTo(20 + 2 * 10 + 28, 0); // mid of bins 10..37
  });
});

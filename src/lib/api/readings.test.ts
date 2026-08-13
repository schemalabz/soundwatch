import { describe, expect, it } from "vitest";
import { deriveCensoring, parseHist } from "./readings";

// Real clamped interval from bench3, 2026-08-12: 59 frames in the open-ended
// top bin, published l10 88.09.
const CLAMPED =
  "0-0-0-0-0-0-0-0-1-23-111-101-62-31-23-15-12-10-14-9-15-11-6-12-10-9-7-14-7-59";
const CLEAN =
  "0-5-0-0-0-0-0-0-1-23-111-101-62-31-23-15-12-10-14-9-15-11-6-12-10-9-7-14-7-0";
const QUIET_FLOOR =
  "9-5-0-0-0-0-0-0-1-23-111-101-62-31-23-15-12-10-14-9-15-11-6-12-10-9-7-14-7-0";

describe("deriveCensoring", () => {
  it("flags the open-ended top bin when it holds frames", () => {
    expect(deriveCensoring(CLAMPED)).toEqual({
      topBinCensored: true,
      bottomBinCensored: false,
    });
  });

  it("reports an honest interval as uncensored", () => {
    expect(deriveCensoring(CLEAN)).toEqual({
      topBinCensored: false,
      bottomBinCensored: false,
    });
  });

  it("flags the open-ended bottom bin (below the 32 dB floor)", () => {
    expect(deriveCensoring(QUIET_FLOOR)).toEqual({
      topBinCensored: false,
      bottomBinCensored: true,
    });
  });

  it("returns null for missing or malformed histograms", () => {
    expect(deriveCensoring(null)).toBeNull();
    expect(deriveCensoring("")).toBeNull();
    expect(deriveCensoring("1-2-3")).toBeNull(); // wrong bin count
    expect(deriveCensoring("a-b-c")).toBeNull();
  });
});

describe("parseHist", () => {
  it("parses 30 dash-separated counts", () => {
    const hist = parseHist(CLAMPED);
    expect(hist).toHaveLength(30);
    expect(hist![29]).toBe(59);
  });

  it("returns null for null or malformed input", () => {
    expect(parseHist(null)).toBeNull();
    expect(parseHist("1-2-3")).toBeNull();
  });
});

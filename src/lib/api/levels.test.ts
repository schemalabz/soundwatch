import { describe, expect, it } from "vitest";
import {
  BOTTOM_BIN_CEILING_DB,
  TOP_BIN_FLOOR_DB,
  describeLevel,
  isLmaxLowerBound,
} from "./levels";

describe("bin edges are derived from the histogram constants", () => {
  it("matches the measured firmware geometry", () => {
    expect(TOP_BIN_FLOOR_DB).toBe(88);
    expect(BOTTOM_BIN_CEILING_DB).toBe(32);
  });
});

describe("describeLevel", () => {
  it("renders a pinned percentile as a floor, not a value", () => {
    // The real bench3 case: l10 88.09 with frames in the open-ended top bin.
    const d = describeLevel(88.09, { topBinCensored: true });
    expect(d.bound).toBe("lower");
    expect(d.display).toBe("≥ 88.1");
  });

  it("leaves a low percentile alone even when the interval had loud frames", () => {
    // 1,607 of 66k production intervals look like this: the flag is set, but
    // l10 sits well below the top bin and is perfectly sound.
    const d = describeLevel(56.5, { topBinCensored: true });
    expect(d.bound).toBeNull();
    expect(d.display).toBe("56.5");
  });

  it("renders a floored quiet percentile as a ceiling", () => {
    const d = describeLevel(31.2, { bottomBinCensored: true });
    expect(d.bound).toBe("upper");
    expect(d.display).toBe("≤ 31.2");
  });

  it("is uncensored when no flags are set", () => {
    expect(describeLevel(63.1).display).toBe("63.1");
    expect(describeLevel(63.1).bound).toBeNull();
  });

  it("handles null and undefined", () => {
    expect(describeLevel(null).display).toBe("—");
    expect(describeLevel(undefined).bound).toBeNull();
  });

  it("censors a value that only reaches the bin floor once rounded", () => {
    // 87.96 displays as "88.0". Thresholding on the raw value rendered that as
    // a bare, confident-looking number sitting exactly at the ceiling.
    const d = describeLevel(87.96, { topBinCensored: true });
    expect(d.bound).toBe("lower");
    expect(d.display).toBe("≥ 88.0");
  });

  it("floors a value that only reaches the bin ceiling once rounded", () => {
    // The bottom-bin mirror of the case above: 32.04 displays as "32.0".
    const d = describeLevel(32.04, { bottomBinCensored: true });
    expect(d.bound).toBe("upper");
    expect(d.display).toBe("≤ 32.0");
  });

  it("censors a value sitting exactly on the top-bin floor", () => {
    expect(describeLevel(88, { topBinCensored: true }).bound).toBe("lower");
  });

  it("leaves a value just below the top-bin floor alone", () => {
    expect(describeLevel(87.9, { topBinCensored: true }).bound).toBeNull();
  });

  it("censors a value sitting exactly on the bottom-bin ceiling", () => {
    expect(describeLevel(32, { bottomBinCensored: true }).bound).toBe("upper");
  });

  it("leaves a value just above the bottom-bin ceiling alone", () => {
    expect(describeLevel(32.1, { bottomBinCensored: true }).bound).toBeNull();
  });

  it("respects the decimals argument", () => {
    expect(describeLevel(88.09, { topBinCensored: true }, 0).display).toBe("≥ 88");
  });
});

describe("isLmaxLowerBound", () => {
  it("is true whenever the interval had top-bin frames", () => {
    // Unlike a percentile, lmax IS bounded by any top-bin frame.
    expect(isLmaxLowerBound({ topBinCensored: true })).toBe(true);
    expect(isLmaxLowerBound({ topBinCensored: false })).toBe(false);
    expect(isLmaxLowerBound({ topBinCensored: null })).toBe(false);
  });
});

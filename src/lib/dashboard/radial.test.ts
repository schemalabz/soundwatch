import { describe, expect, it } from "vitest";
import { radialDomain, radialGrid } from "./radial";

describe("radialDomain", () => {
  it("wraps a wide spread in whole dB with half a dB of headroom", () => {
    expect(radialDomain([62.3, 71.7, 66])).toEqual({ lo: 61, hi: 73 });
  });
  it("never represents less than the minimum span, centred on the data", () => {
    expect(radialDomain([70.1, 70.4, 70.2])).toEqual({ lo: 66, hi: 74 });
  });
  it("has a domain for no data", () => {
    expect(radialDomain([])).toEqual({ lo: 0, hi: 6 });
  });
});

describe("radialGrid", () => {
  it("steps by 2 on a narrow domain, strictly inside it", () => {
    expect(radialGrid(66, 74)).toEqual([68, 70, 72]);
  });
  it("steps by 5 on a medium domain", () => {
    expect(radialGrid(61, 73)).toEqual([65, 70]);
  });
  it("steps by 10 on a wide domain", () => {
    expect(radialGrid(40, 95)).toEqual([50, 60, 70, 80, 90]);
  });
});

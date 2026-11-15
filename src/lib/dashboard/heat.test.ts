import { describe, expect, it } from "vitest";
import { dowHourKey, heatColor, heatScale, HEAT_STOPS, MIN_HEAT_SPAN_DB } from "./heat";

describe("heatScale", () => {
  it("spans the values' own range and ignores gaps", () => {
    expect(heatScale([60, null, 72, undefined, 66])).toEqual({ lo: 60, hi: 72 });
  });

  it("is null when nothing has a value", () => {
    expect(heatScale([null, undefined])).toBeNull();
  });

  it("widens a flat grid so sub-dB noise is not drawn as full contrast", () => {
    const s = heatScale([70, 70.5])!;
    expect(s.hi - s.lo).toBe(MIN_HEAT_SPAN_DB);
    expect((s.lo + s.hi) / 2).toBeCloseTo(70.25);
  });
});

describe("heatColor", () => {
  const scale = { lo: 60, hi: 80 };
  const rgb = (c: number[]) => `rgb(${c.join(",")})`;

  it("puts the ends and the middle on the stops", () => {
    expect(heatColor(60, scale)).toBe(rgb(HEAT_STOPS[0]));
    expect(heatColor(70, scale)).toBe(rgb(HEAT_STOPS[1]));
    expect(heatColor(80, scale)).toBe(rgb(HEAT_STOPS[2]));
  });

  it("clamps outside the scale", () => {
    expect(heatColor(20, scale)).toBe(rgb(HEAT_STOPS[0]));
    expect(heatColor(120, scale)).toBe(rgb(HEAT_STOPS[2]));
  });
});

describe("dowHourKey", () => {
  it("matches the wire key of /api/series dowHours", () => {
    expect(dowHourKey(0, 0)).toBe(0);
    expect(dowHourKey(6, 23)).toBe(167);
  });
});

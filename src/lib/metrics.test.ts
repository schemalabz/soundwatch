import { describe, expect, it } from "vitest";
import { getMetricDef } from "./metrics";
import { getTranslatedGuidelineBadge } from "./guidelines";

describe("the noise metric", () => {
  const def = getMetricDef("noiseDba")!;

  it("is not labelled dBA — the levels are uncalibrated device-dB", () => {
    expect(def.unit).toBe("dB");
  });

  it("carries no regulatory guideline", () => {
    // A WHO/legal threshold cannot be applied to an uncalibrated level.
    expect(def.guideline).toBeUndefined();
  });

  it("renders no compliance badge at any level", () => {
    const t = (k: string) => k;
    expect(getTranslatedGuidelineBadge(45, "noiseDba", t)).toBeNull();
    expect(getTranslatedGuidelineBadge(95, "noiseDba", t)).toBeNull();
  });

  it("leaves other metrics' guidelines intact", () => {
    // PM is a stock sensor reporting real ug/m3 — those WHO limits are valid.
    expect(getMetricDef("pm25")?.guideline).toBeDefined();
  });
});

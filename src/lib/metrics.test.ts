import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("no dBA claim survives anywhere user-facing", () => {
  // The unit was hardcoded in three components and two locale strings, so
  // fixing metrics.ts alone left the claim on screen. Pin it.
  const files = [
    "src/components/sensors/SensorDetailClient.tsx",
    "src/components/map/SensorPreviewPanel.tsx",
    "src/components/leaderboard/LeaderboardPanel.tsx",
    "src/messages/en.json",
    "src/messages/el.json",
  ];

  it.each(files)("%s does not assert dBA", (f) => {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    expect(src).not.toMatch(/dB\s?\(?A\)?/);
  });
});

import { describe, expect, it } from "vitest";
import { CAGG_SQL, HEALTH_CAGG_SQL, stampFor } from "../../../scripts/timescale-objects";

// The health rollup's two load-bearing choices, pinned so a "tidy-up" cannot
// quietly undo them. See the comment above HEALTH_STATEMENTS.
describe("readings_hour_health definition", () => {
  it("keeps rows with no level: a dead microphone must still report health", () => {
    expect(HEALTH_CAGG_SQL).not.toMatch(/laeq\s+IS\s+NOT\s+NULL/i);
  });

  it("classifies arrival with a 30-minute cut, wider than device clock drift", () => {
    expect(HEALTH_CAGG_SQL).toContain("received_at - recorded_at <= INTERVAL '30 minutes'");
  });

  it("stores sums and counts, so hours combine exactly", () => {
    expect(HEALTH_CAGG_SQL).toMatch(/sum\(rssi\)/);
    expect(HEALTH_CAGG_SQL).toMatch(/count\(rssi\)/);
    expect(HEALTH_CAGG_SQL).not.toMatch(/avg\(/i);
  });

  it("has its own stamp, distinct from the level rollup's", () => {
    expect(stampFor(HEALTH_CAGG_SQL)).not.toBe(stampFor(CAGG_SQL));
  });
});

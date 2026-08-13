import { describe, expect, it } from "vitest";
import { BUCKETS, bucketViable, defaultBucket, needsRawReadings, pointCount, resolveBucket } from "./buckets";

const H = 3600_000;
const D = 86_400_000;

describe("bucket ladder", () => {
  it("splits at one hour, which is where the rollup stops being able to answer", () => {
    for (const b of BUCKETS) {
      expect(needsRawReadings(b.seconds)).toBe(b.seconds < 3600);
    }
  });

  it("the key workflow — last 24h — defaults to minutes, not 24 flat hours", () => {
    const b = defaultBucket(24 * H);
    expect(b.seconds).toBeLessThan(3600);
    expect(pointCount(24 * H, b.seconds)).toBeGreaterThan(100);
  });

  it("offers minute and 5-minute resolution over a day, and neither over 90", () => {
    expect(bucketViable(24 * H, 60)).toBe(true);
    expect(bucketViable(24 * H, 300)).toBe(true);
    expect(bucketViable(90 * D, 60)).toBe(false);
    expect(bucketViable(90 * D, 300)).toBe(false);
  });

  it("never lets a request cost more than the point cap", () => {
    // A stale URL asking for minutes across 90 days must not reach SQL.
    const b = resolveBucket("1m", 90 * D);
    expect(b.seconds).toBeGreaterThanOrEqual(3600);
    expect(pointCount(90 * D, b.seconds)).toBeLessThanOrEqual(2000);
  });

  it("honours a viable explicit choice, and falls back on an unknown one", () => {
    expect(resolveBucket("5m", 24 * H).id).toBe("5m");
    expect(resolveBucket("nonsense", 24 * H).id).toBe(defaultBucket(24 * H).id);
  });

  it("keeps every domain we can select drawable", () => {
    for (const domain of [24 * H, 7 * D, 30 * D, 90 * D, 365 * D]) {
      const b = defaultBucket(domain);
      const n = pointCount(domain, b.seconds);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(2000);
    }
  });
});

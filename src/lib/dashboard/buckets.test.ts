import { describe, expect, it } from "vitest";
import {
  BUCKETS,
  bucketById,
  bucketViable,
  defaultBucket,
  needsRawReadings,
  pointCount,
  resolveBucket,
} from "./buckets";

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

    // Asserted at a domain where the default is NOT the first bucket. At 24 h
    // both resolveBucket("nonsense", …) and defaultBucket(…) return "1m", so
    // comparing them cannot tell a fallback from "an unknown id silently
    // became the finest bucket".
    expect(bucketById("nonsense")).toBeUndefined();
    expect(defaultBucket(30 * D).id).toBe("1h");
    expect(resolveBucket("nonsense", 30 * D).id).toBe("1h");
  });

  it("gates the raw path on domain length, not on point count", () => {
    // MAX_POINTS bounds output rows; the raw scan costs domain x sensors, and
    // the two come apart. 7 days at 5m is only 2016 points but seven days of
    // raw rows — ~6M at the simulator's cadence — re-issued every 30 s while
    // the live gate is on.
    expect(bucketViable(7 * D, 300)).toBe(false);
    expect(bucketViable(30 * D, 900)).toBe(false);
    for (const domain of [7 * D, 30 * D, 90 * D]) {
      expect(needsRawReadings(defaultBucket(domain).seconds), `${domain}`).toBe(false);
      expect(needsRawReadings(resolveBucket("1m", domain).seconds)).toBe(false);
    }
  });

  it("keeps the live workflow this was built for", () => {
    // Last 24 h, live, one-minute intervals. 1440 points off raw readings over
    // a single chunk — the case MAX_RAW_DOMAIN_MS is sized to protect.
    expect(bucketViable(24 * H, 60)).toBe(true);
    expect(defaultBucket(24 * H).id).toBe("1m");
    expect(resolveBucket("1m", 24 * H).id).toBe("1m");
  });

  it("gives a very short domain the finest bucket, not the coarsest", () => {
    // Nothing is viable at ten minutes — even 1m yields fewer than MIN_POINTS.
    // Falling back to the coarsest drew one point across a week-wide bucket;
    // the finest is both the useful answer and the cheap one, since a domain
    // that short costs nothing to scan.
    expect(defaultBucket(10 * 60 * 1000).id).toBe("1m");
    expect(defaultBucket(60 * 1000).id).toBe("1m");
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

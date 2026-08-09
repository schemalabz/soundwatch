// Shared shape of GET /api/freshness — imported by both the route and the
// dashboard page so the contract cannot drift silently.

export interface FreshnessSensor {
  id: string;
  deviceId: string;
  name: string | null;
  secondsAgo: number | null;
  spanDays: number | null;
  lastLaeq: number | null;
}

export interface FreshnessResponse {
  now: string;
  fleet: {
    total: number;
    reportingLast60s: number;
    newestSecondsAgo: number | null;
    oldestDataDays: number | null;
  };
  sensors: FreshnessSensor[];
}

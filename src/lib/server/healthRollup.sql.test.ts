import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { HEALTH_CAGG_SQL } from "../../../scripts/timescale-objects";

// Runs the aggregate's own SELECT (not a copy) over a fixture that shadows
// `readings` with a CTE: read-only, needs any TimescaleDB. Opt-in, since CI
// has no database service.
const run = !!process.env.HEALTH_SQL_DB;
const select = HEALTH_CAGG_SQL.slice(HEALTH_CAGG_SQL.indexOf("SELECT"), HEALTH_CAGG_SQL.indexOf("WITH NO DATA"));
const FIXTURE = `
  WITH readings AS (SELECT * FROM (VALUES
    ('a', '2026-10-01T10:05:00Z'::timestamptz, '2026-10-01T10:05:30Z'::timestamptz, -60::double precision, 98::double precision, 0, 55::double precision),
    ('a', '2026-10-01T10:10:00Z', '2026-10-01T12:00:00Z', -70, 97, 0, NULL),   -- uploaded 110 min late
    ('a', '2026-10-01T10:20:00Z', '2026-10-01T10:20:00Z', NULL, 97, 2, NULL),  -- dead microphone, no rssi
    ('a', '2026-10-01T11:50:00Z', '2026-10-01T12:10:00Z', -50, 96, 0, 60)      -- slow clock: 20 min, still on time
  ) v(sensor_id, recorded_at, received_at, rssi, battery, publish_fails, laeq))
  SELECT bucket, n::int, n_on_time::int, rssi_n::int, rssi_sum::float8 FROM (${select}) h ORDER BY bucket`;

describe.runIf(run)("readings_hour_health, executed", () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());
  it("buckets on device time, counts every row, splits on-time from late", async () => {
    const rows = await prisma.$queryRawUnsafe<{ bucket: Date; n: number; n_on_time: number; rssi_n: number; rssi_sum: number }[]>(FIXTURE);
    expect(rows).toEqual([
      { bucket: new Date("2026-10-01T10:00:00Z"), n: 3, n_on_time: 2, rssi_n: 2, rssi_sum: -130 },
      { bucket: new Date("2026-10-01T11:00:00Z"), n: 1, n_on_time: 1, rssi_n: 1, rssi_sum: -50 },
    ]);
  });
});

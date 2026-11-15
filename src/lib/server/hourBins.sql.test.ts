import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { CAGG_SQL } from "../../../scripts/timescale-objects";
import { RB_HOUR } from "./hourBucket";

// Runs readings_hour_bins' own SELECT (not a copy) over a fixture shadowing
// `readings`, then reads it back the way every endpoint does, through RB_HOUR.
// Opt-in like healthRollup.sql.test.ts: needs any TimescaleDB, set HEALTH_SQL_DB.
const run = !!process.env.HEALTH_SQL_DB;
const select = CAGG_SQL.slice(CAGG_SQL.indexOf("SELECT"), CAGG_SQL.indexOf("WITH NO DATA"));
const FIXTURE = `
  WITH readings AS (SELECT * FROM (VALUES
    -- device 5 min fast: stamped 11:02, really 10:57 -> belongs to 10:00
    ('a', '2026-10-01T11:02:00Z'::timestamptz, -1::smallint, 60::double precision, NULL::double precision),
    ('a', '2026-10-01T11:30:00Z', 0, 60, NULL),
    -- device 4 min slow: stamped 10:58, really 11:02 -> belongs to 11:00
    ('a', '2026-10-01T10:58:00Z', 1, 60, NULL)
  ) v(sensor_id, recorded_at, corrected_hour_shift, laeq, lmax_est)),
  readings_hour_bins AS (${select})
  SELECT ${RB_HOUR} AS hour, sum(rb.n)::int AS n FROM readings_hour_bins rb GROUP BY 1 ORDER BY 1`;

describe.runIf(run)("readings_hour_bins, executed", () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());
  it("puts each reading in its corrected hour", async () => {
    const rows = await prisma.$queryRawUnsafe<{ hour: Date; n: number }[]>(FIXTURE);
    expect(rows).toEqual([
      { hour: new Date("2026-10-01T10:00:00Z"), n: 1 },
      { hour: new Date("2026-10-01T11:00:00Z"), n: 2 },
    ]);
  });
});

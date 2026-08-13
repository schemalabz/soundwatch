// TimescaleDB adoption, part 2 of 2 (the NON-transactional part).
//
// Continuous aggregates and their policies cannot be created inside a
// transaction, and Prisma wraps every migration in one — so this script owns
// them instead. It runs right after `prisma migrate deploy` wherever
// migrations run (ingester CMD, sim-backfill), is idempotent, and tolerates
// concurrent execution (both services may race on a fresh stack: IF NOT
// EXISTS everywhere, plus catch-and-continue on "already exists").
//
// THE rollup: readings_hour_bins — per (sensor, hour, 1-dB level bin) counts,
// energy sums and Lmax. One aggregate serves /api/series (charts),
// /api/aggregate (map aggregate mode + leaderboard) and /api/status
// (liveness cells): counts and energy are summable across any slice of
// sensors/hours, and percentiles interpolate from the bin counts
// (src/lib/server/levelBins.ts — the bin constants there MUST match the SQL
// below; levelBins.test.ts pins them together).
//
// materialized_only=false makes queries merge the not-yet-materialized tail
// straight from raw readings, so the live edge is always fresh; the refresh
// policy (Timescale's own job scheduler, no external cron) materializes an
// hour after it closes.

import { PrismaClient } from "@prisma/client";

// Mirrors BIN_LO / BIN_HI / BIN_COUNT in src/lib/server/levelBins.ts —
// duplicated because this script also runs in the ingester image, which does
// not ship src/lib.
export const CAGG_BINS = { lo: 30, hi: 128, count: 98 } as const;

/** The bin scheme this file intends, stamped onto the view as a comment. */
const BIN_STAMP = `sw-bins:${CAGG_BINS.lo}/${CAGG_BINS.hi}/${CAGG_BINS.count}`;

const STATEMENTS: { label: string; sql: string; call?: boolean }[] = [
  {
    label: "continuous aggregate readings_hour_bins",
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS readings_hour_bins
      WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
      SELECT
        sensor_id,
        time_bucket('1 hour', recorded_at) AS bucket,
        width_bucket(laeq, ${CAGG_BINS.lo}, ${CAGG_BINS.hi}, ${CAGG_BINS.count}) AS bin,
        count(*)                            AS n,
        sum(power(10, laeq / 10))           AS energy,
        max(COALESCE(lmax_est, laeq))       AS lmax
      FROM readings
      WHERE laeq IS NOT NULL
      GROUP BY 1, 2, 3
      WITH NO DATA`,
  },
  {
    // The stamp the drift check reads. Written every run so an aggregate
    // created before stamping existed adopts one without a rebuild.
    label: "bin-definition stamp",
    // A continuous aggregate's user-facing object is a plain VIEW (relkind
    // 'v') over the materialized hypertable — COMMENT ON MATERIALIZED VIEW
    // errors with "is not a materialized view".
    sql: `COMMENT ON VIEW readings_hour_bins IS '${BIN_STAMP}'`,
  },
  {
    label: "refresh policy",
    sql: `
      SELECT add_continuous_aggregate_policy(
        'readings_hour_bins',
        start_offset      => INTERVAL '3 hours',
        end_offset        => INTERVAL '1 hour',
        schedule_interval => INTERVAL '15 minutes',
        if_not_exists     => true)`,
  },
  {
    // Incremental by construction: Timescale's invalidation log makes a
    // full-range refresh a no-op for regions that are already fresh, so
    // running this on every boot only pays for what actually changed.
    label: "initial/catch-up refresh",
    sql: `CALL refresh_continuous_aggregate('readings_hour_bins', NULL, now() - INTERVAL '1 hour')`,
    call: true,
  },
];

/**
 * Drop the aggregate when its bin definition no longer matches this file.
 *
 * Every statement below is CREATE ... IF NOT EXISTS, which makes re-running
 * safe but also makes a CHANGED definition a silent no-op: raising the bin
 * ceiling would leave the old bins materialized and every percentile still
 * clamped, with nothing in the logs to say so.
 *
 * The check reads a stamp we write onto the view rather than parsing its
 * stored SQL — Postgres normalizes that text (`30` becomes
 * `(30)::double precision`), so matching against it is guesswork that fails
 * open or, worse, fails closed and rebuilds on every boot.
 *
 * Safe to drop: raw readings are retained (no retention policy), so the
 * refresh rebuilds all history exactly.
 */
async function dropIfDefinitionDrifted(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ stamp: string | null }[]>(
    `SELECT obj_description(c.oid, 'pg_class') AS stamp
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'readings_hour_bins' AND n.nspname = 'public'`
  );
  if (rows.length === 0) return; // nothing to drift from
  if (rows[0].stamp === BIN_STAMP) return;
  console.log(
    `[timescale-objects] bin definition changed (${rows[0].stamp ?? "unstamped"} -> ${BIN_STAMP}) — rebuilding`
  );
  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS readings_hour_bins CASCADE`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await dropIfDefinitionDrifted(prisma);
    for (const s of STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(s.sql);
        console.log(`[timescale-objects] ok: ${s.label}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(msg)) {
          console.log(`[timescale-objects] exists: ${s.label}`);
        } else if (/concurrent refresh/i.test(msg)) {
          // The ingester and sim-backfill both run this on boot and can reach
          // the refresh together (Postgres 55P03). Whoever got there first is
          // doing the work, and the refresh policy would catch up regardless —
          // losing the race is not a failure.
          console.log(`[timescale-objects] already running elsewhere: ${s.label}`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Import-safe: levelBins.test.ts imports CAGG_BINS without running anything.
const invokedDirectly = process.argv[1]?.includes("timescale-objects");
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[timescale-objects] failed:", err);
    process.exit(1);
  });
}

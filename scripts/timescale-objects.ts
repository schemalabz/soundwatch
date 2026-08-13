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

import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

// Mirrors BIN_LO / BIN_HI / BIN_COUNT in src/lib/server/levelBins.ts —
// duplicated because this script also runs in the ingester image, which does
// not ship src/lib.
export const CAGG_BINS = { lo: 30, hi: 128, count: 98 } as const;

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
    label: "refresh policy (live edge)",
    sql: `
      SELECT add_continuous_aggregate_policy(
        'readings_hour_bins',
        start_offset      => INTERVAL '3 hours',
        end_offset        => INTERVAL '1 hour',
        schedule_interval => INTERVAL '15 minutes',
        if_not_exists     => true)`,
  },
  {
    // The live-edge policy above never looks further back than 3 hours, and
    // our devices store-and-forward: a unit that was offline for a day
    // reconnects and writes rows into buckets that closed long ago. Those
    // buckets are already materialized, the invalidation is recorded, and
    // nothing ever comes back to act on it. materialized_only = false does
    // not save us — it unions raw rows only ABOVE the materialization
    // watermark, not below it. So the hours around an outage stay
    // permanently undercounted, and the only thing that repaired them was a
    // service restart, which in production is weeks apart.
    //
    // Once a day, walk the last 30 days. The offsets do not overlap the live
    // policy's (30 days -> 3 hours vs 3 hours -> 1 hour), and Timescale's
    // invalidation log makes the pass cost only what actually changed.
    label: "refresh policy (late-arriving data)",
    sql: `
      SELECT add_continuous_aggregate_policy(
        'readings_hour_bins',
        start_offset      => INTERVAL '30 days',
        end_offset        => INTERVAL '3 hours',
        schedule_interval => INTERVAL '1 day',
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
 * The fingerprint of the aggregate this file intends: a hash of the CREATE
 * statement itself.
 *
 * A stamp holding only the three bin numbers guarded only the three bin
 * numbers. Changing time_bucket('1 hour') to '30 minutes', or
 * max(COALESCE(lmax_est, laeq)) to max(laeq), left the stamp identical, so
 * the drift check passed, IF NOT EXISTS made the CREATE a no-op, and a stale
 * aggregate shipped with nothing in the logs. Both mutations were tried
 * against the full suite: neither failed a test.
 *
 * Hashing the source text we send has no normalization problem — that is the
 * whole reason we do not read view_definition back from Postgres, which
 * rewrites `30` as `(30)::double precision`.
 */
export const CAGG_SQL = STATEMENTS.find((s) => s.label.startsWith("continuous aggregate"))!.sql;

export function stampFor(sql: string): string {
  return `sw-cagg:${createHash("sha256").update(sql).digest("hex").slice(0, 16)}`;
}

const CAGG_STAMP = stampFor(CAGG_SQL);

/**
 * The stamp the drift check reads. Written on every run, so an aggregate
 * created before stamping existed adopts one without a rebuild.
 *
 * A continuous aggregate's user-facing object is a plain VIEW (relkind 'v')
 * over the materialized hypertable — COMMENT ON MATERIALIZED VIEW errors with
 * "is not a materialized view".
 */
const STAMP_STATEMENT: { label: string; sql: string; call?: boolean } = {
  label: "definition stamp",
  sql: `COMMENT ON VIEW readings_hour_bins IS '${CAGG_STAMP}'`,
};

/**
 * Drop the aggregate when its definition no longer matches this file.
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
async function dropIfDefinitionDrifted(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ stamp: string | null }[]>(
    `SELECT obj_description(c.oid, 'pg_class') AS stamp
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'readings_hour_bins' AND n.nspname = 'public'`
  );
  if (rows.length === 0) return false; // nothing to drift from
  if (rows[0].stamp === CAGG_STAMP) return false;
  console.log(
    `[timescale-objects] definition changed (${rows[0].stamp ?? "unstamped"} -> ${CAGG_STAMP}) — rebuilding`
  );
  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS readings_hour_bins CASCADE`);
  return true;
}

/** Wait out whoever holds the refresh, then take our turn. */
async function retryRefresh(prisma: PrismaClient, sql: string): Promise<void> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * attempt)));
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`[timescale-objects] refresh succeeded on attempt ${attempt + 1}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/concurrent refresh/i.test(msg)) throw err;
    }
  }
  // Do not start the service on an empty aggregate pretending to be a full one.
  throw new Error(
    "could not refresh readings_hour_bins after rebuilding it — it is EMPTY and " +
      "every rollup endpoint would serve near-nothing"
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // A rebuild leaves the aggregate EMPTY until the catch-up refresh runs, so
    // losing the race for it is not the harmless outcome it is on a normal
    // boot: /api/series and /api/aggregate would serve almost nothing, and the
    // live-edge policy only reaches back three hours. (Observed exactly this
    // locally — 4 of 168 hourly buckets survived a rebuild whose refresh was
    // skipped.) The late-data policy would repair it, a day later.
    const rebuilt = await dropIfDefinitionDrifted(prisma);
    for (const s of [STATEMENTS[0], STAMP_STATEMENT, ...STATEMENTS.slice(1)]) {
      try {
        await prisma.$executeRawUnsafe(s.sql);
        console.log(`[timescale-objects] ok: ${s.label}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(msg)) {
          console.log(`[timescale-objects] exists: ${s.label}`);
        } else if (/concurrent refresh/i.test(msg)) {
          // The app, the ingester and sim-backfill all run this on boot and can
          // reach the refresh together (Postgres 55P03). On a normal boot the
          // aggregate is already populated and whoever got there first is doing
          // the work, so losing the race is not a failure.
          //
          // After a rebuild it is. Wait for the other party and try again.
          if (rebuilt && s.call) {
            console.log(`[timescale-objects] refresh contended after a rebuild; retrying: ${s.label}`);
            await retryRefresh(prisma, s.sql);
          } else {
            console.log(`[timescale-objects] already running elsewhere: ${s.label}`);
          }
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

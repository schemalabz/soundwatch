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
 * The stamp scheme this file used before the hash: it encoded the three bin
 * numbers and nothing else.
 */
const LEGACY_STAMP = `sw-bins:${CAGG_BINS.lo}/${CAGG_BINS.hi}/${CAGG_BINS.count}`;

/**
 * The hash of the definition that was live while LEGACY_STAMP was being
 * written. Production carries `sw-bins:30/128/98` today, and the CREATE
 * statement is byte-identical to the one that stamp described — so without
 * this, merging would find a mismatch that reflects no definitional change,
 * DROP the live rollup and rebuild from empty, while start.sh holds the deploy
 * behind it and any still-serving instance loses its aggregate mid-request.
 *
 * Pinned to a literal rather than computed, so it EXPIRES on its own: change
 * the view and CAGG_STAMP stops matching this, the compatibility branch stops
 * applying, and a real definitional change rebuilds as it should.
 */
const LEGACY_EQUIVALENT_STAMP = "sw-cagg:30d2e014d00d12ea";

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
  const stamp = rows[0].stamp;
  if (stamp === CAGG_STAMP) return false;

  // The rename from the bin-triple scheme to the hash is not a definitional
  // change. Re-stamp, do not rebuild.
  if (stamp === LEGACY_STAMP && CAGG_STAMP === LEGACY_EQUIVALENT_STAMP) {
    console.log(`[timescale-objects] adopting the hash stamp (${stamp} -> ${CAGG_STAMP}); definition unchanged`);
    return false;
  }

  console.log(
    `[timescale-objects] definition changed (${stamp ?? "unstamped"} -> ${CAGG_STAMP}) — rebuilding`
  );
  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS readings_hour_bins CASCADE`);
  return true;
}

/**
 * Is the aggregate actually covering the history it claims to?
 *
 * The previous check asked whether OUR refresh call returned without error,
 * which answers a question about this process rather than about the database.
 * Two states it cannot tell apart:
 *
 *   EMPTY is correct and merely slower — materialized_only = false unions
 *   straight from raw readings, so queries return the right numbers.
 *
 *   PARTIAL is silently wrong. A refresh interrupted part-way leaves a
 *   watermark reading fully current over a fraction of the history: measured
 *   on a fixture, 1,054,421 raw readings rendered as 0 rows, and 73% of hours
 *   became invisible with nothing in the database saying so. That, not
 *   emptiness, is what turns 168 bars into 4.
 *
 * Comparing the aggregate's earliest bucket against the earliest bucket in raw
 * readings is correct in BOTH states, because on a truly empty aggregate the
 * real-time union makes the two agree.
 */
async function coverageIsComplete(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ ok: boolean | null }[]>(
    `SELECT (
       SELECT min(bucket) FROM readings_hour_bins
     ) <= (
       SELECT time_bucket('1 hour', min(recorded_at)) FROM readings WHERE laeq IS NOT NULL
     ) AS ok`
  );
  // No readings at all -> nothing to cover, which is complete.
  const raw = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM readings WHERE laeq IS NOT NULL`
  );
  if (Number(raw[0].n) === 0) return true;
  return rows[0]?.ok === true;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await dropIfDefinitionDrifted(prisma);

    // The stamp is written LAST, after coverage is confirmed. It used to be
    // second — [CREATE, STAMP, ...rest] — with the catch-up refresh in `rest`,
    // so any interruption between them left a matching stamp sitting over a
    // partial aggregate. The next boot saw the match, concluded nothing had
    // drifted, and never repaired it; the late-data policy reaches back 30
    // days, so anything older was gone for good.
    for (const s of STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(s.sql);
        console.log(`[timescale-objects] ok: ${s.label}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(msg)) {
          console.log(`[timescale-objects] exists: ${s.label}`);
        } else if (/concurrent refresh/i.test(msg)) {
          // The app, the ingester and sim-backfill all run this on boot and
          // can reach the refresh together (Postgres 55P03). Whether losing
          // that race matters is not knowable from the error — it depends on
          // what the winner leaves behind, which the coverage probe below
          // asks the database directly.
          console.log(`[timescale-objects] refresh contended: ${s.label}`);
        } else {
          throw err;
        }
      }
    }

    // Decided from the database, not from this process's exit status. The old
    // `rebuilt` flag was a per-process local: the peer that lost the DROP race
    // got `false`, logged "already running elsewhere", and went on to exec the
    // server against an aggregate that might be partly filled — the exact case
    // the retry was added to close.
    const refresh = STATEMENTS.find((x) => x.call)!;
    for (let attempt = 1; ; attempt++) {
      if (await coverageIsComplete(prisma)) break;
      if (attempt > 10) {
        throw new Error(
          "readings_hour_bins does not cover the history in readings after " +
            "10 refresh attempts. It is PARTIAL, which is silently wrong rather " +
            "than merely slow, and every rollup endpoint would under-report."
        );
      }
      console.log(`[timescale-objects] coverage incomplete; refreshing (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * attempt)));
      try {
        await prisma.$executeRawUnsafe(refresh.sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/concurrent refresh/i.test(msg)) throw err;
      }
    }
    console.log("[timescale-objects] coverage complete");

    await prisma.$executeRawUnsafe(STAMP_STATEMENT.sql);
    console.log(`[timescale-objects] ok: ${STAMP_STATEMENT.label}`);
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

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

// THE health rollup: readings_hour_health — per (sensor, hour) the device
// telemetry the fleet admin needs: how many readings, how many arrived on
// time versus uploaded late, wifi signal, battery, upload delay, failed
// uploads. Same machinery as readings_hour_bins (policies, stamp, coverage).
//
// Bucketed on recorded_at because a hypertable aggregate must bucket on the
// partition column — but every row is ALSO classified by arrival. An hour
// whose rows all arrived late is "measured offline, uploaded later" (amber),
// never "live" (green). Reading presence off recorded_at alone is the trap
// /api/status documents: a backlog flushed on reconnect turned three days of
// outage green. 30 minutes, not 5: device clocks drift up to ~25 min a day
// and reset at the 06:00 restart, so a 5-minute cut calls a slow clock late.
//
// No `WHERE laeq IS NOT NULL`: a unit with a dead microphone still reports
// health, and that is exactly when we want to see it.
//
// Sums and counts rather than averages, so any range of hours combines
// exactly (an average of hourly averages is not the average).
const HEALTH_STATEMENTS: { label: string; sql: string; call?: boolean }[] = [
  {
    label: "continuous aggregate readings_hour_health",
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS readings_hour_health
      WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
      SELECT
        sensor_id,
        time_bucket('1 hour', recorded_at)                                        AS bucket,
        count(*)                                                                  AS n,
        count(*) FILTER (WHERE received_at - recorded_at <= INTERVAL '30 minutes') AS n_on_time,
        count(rssi)                                                               AS rssi_n,
        sum(rssi)                                                                 AS rssi_sum,
        min(rssi)                                                                 AS rssi_min,
        min(battery)                                                              AS battery_min,
        max(battery)                                                              AS battery_max,
        max(extract(epoch FROM received_at - recorded_at))                        AS max_delay_s,
        max(publish_fails)                                                        AS publish_fails_max,
        max(received_at)                                                          AS last_received
      FROM readings
      GROUP BY 1, 2
      WITH NO DATA`,
  },
  {
    label: "health refresh policy (live edge)",
    sql: `
      SELECT add_continuous_aggregate_policy(
        'readings_hour_health',
        start_offset      => INTERVAL '3 hours',
        end_offset        => INTERVAL '1 hour',
        schedule_interval => INTERVAL '15 minutes',
        if_not_exists     => true)`,
  },
  {
    // Same reason as the bins rollup: backlogs land in hours that closed long
    // ago, and only a pass that reaches back picks them up.
    label: "health refresh policy (late-arriving data)",
    sql: `
      SELECT add_continuous_aggregate_policy(
        'readings_hour_health',
        start_offset      => INTERVAL '30 days',
        end_offset        => INTERVAL '3 hours',
        schedule_interval => INTERVAL '1 day',
        if_not_exists     => true)`,
  },
  {
    label: "health initial/catch-up refresh",
    sql: `CALL refresh_continuous_aggregate('readings_hour_health', NULL, now() - INTERVAL '1 hour')`,
    call: true,
  },
];

export const HEALTH_CAGG_SQL = HEALTH_STATEMENTS[0].sql;

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

/** One continuous aggregate this file owns, and how to check it. */
interface Aggregate {
  view: string;
  statements: { label: string; sql: string; call?: boolean }[];
  stamp: string;
  /** Earliest raw bucket the aggregate must cover (an hour, as a timestamp). */
  rawEarliestSql: string;
  /** Rows that must exist before "covered" means anything. */
  rawCountSql: string;
  /** A stamp that means "same definition, older naming": re-stamp, do not rebuild. */
  legacy?: { stamp: string; equivalentTo: string };
}

const AGGREGATES: Aggregate[] = [
  {
    view: "readings_hour_bins",
    statements: STATEMENTS,
    stamp: CAGG_STAMP,
    rawEarliestSql: `SELECT time_bucket('1 hour', min(recorded_at)) FROM readings WHERE laeq IS NOT NULL`,
    rawCountSql: `SELECT count(*) AS n FROM readings WHERE laeq IS NOT NULL`,
    legacy: { stamp: LEGACY_STAMP, equivalentTo: LEGACY_EQUIVALENT_STAMP },
  },
  {
    view: "readings_hour_health",
    statements: HEALTH_STATEMENTS,
    stamp: stampFor(HEALTH_CAGG_SQL),
    rawEarliestSql: `SELECT time_bucket('1 hour', min(recorded_at)) FROM readings`,
    rawCountSql: `SELECT count(*) AS n FROM readings`,
  },
];

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
async function dropIfDefinitionDrifted(prisma: PrismaClient, agg: Aggregate): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ stamp: string | null }[]>(
    `SELECT obj_description(c.oid, 'pg_class') AS stamp
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = '${agg.view}' AND n.nspname = 'public'`
  );
  if (rows.length === 0) return false; // nothing to drift from
  const stamp = rows[0].stamp;
  if (stamp === agg.stamp) return false;

  // The rename from the bin-triple scheme to the hash is not a definitional
  // change. Re-stamp, do not rebuild.
  if (agg.legacy && stamp === agg.legacy.stamp && agg.stamp === agg.legacy.equivalentTo) {
    console.log(`[timescale-objects] adopting the hash stamp (${stamp} -> ${agg.stamp}); definition unchanged`);
    return false;
  }

  console.log(
    `[timescale-objects] ${agg.view}: definition changed (${stamp ?? "unstamped"} -> ${agg.stamp}) — rebuilding`
  );
  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS ${agg.view} CASCADE`);
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
async function coverageIsComplete(prisma: PrismaClient, agg: Aggregate): Promise<boolean> {
  // No readings at all -> nothing to cover, which is complete.
  const raw = await prisma.$queryRawUnsafe<{ n: bigint }[]>(agg.rawCountSql);
  if (Number(raw[0].n) === 0) return true;
  const rows = await prisma.$queryRawUnsafe<{ ok: boolean | null }[]>(
    `SELECT (SELECT min(bucket) FROM ${agg.view}) <= (${agg.rawEarliestSql}) AS ok`
  );
  return rows[0]?.ok === true;
}

async function ensureAggregate(prisma: PrismaClient, agg: Aggregate): Promise<void> {
  await dropIfDefinitionDrifted(prisma, agg);

  // The stamp is written LAST, after coverage is confirmed. It used to be
  // second — [CREATE, STAMP, ...rest] — with the catch-up refresh in `rest`,
  // so any interruption between them left a matching stamp sitting over a
  // partial aggregate. The next boot saw the match, concluded nothing had
  // drifted, and never repaired it; the late-data policy reaches back 30
  // days, so anything older was gone for good.
  for (const s of agg.statements) {
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
  const refresh = agg.statements.find((x) => x.call)!;
  for (let attempt = 1; ; attempt++) {
    if (await coverageIsComplete(prisma, agg)) break;
    if (attempt > 10) {
      throw new Error(
        `${agg.view} does not cover the history in readings after ` +
          "10 refresh attempts. It is PARTIAL, which is silently wrong rather " +
          "than merely slow, and every endpoint reading it would under-report."
      );
    }
    console.log(`[timescale-objects] ${agg.view}: coverage incomplete; refreshing (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * attempt)));
    try {
      await prisma.$executeRawUnsafe(refresh.sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/concurrent refresh/i.test(msg)) throw err;
    }
  }
  console.log(`[timescale-objects] ${agg.view}: coverage complete`);

  // A continuous aggregate's user-facing object is a plain VIEW (relkind 'v')
  // over the materialized hypertable — COMMENT ON MATERIALIZED VIEW errors
  // with "is not a materialized view".
  await prisma.$executeRawUnsafe(`COMMENT ON VIEW ${agg.view} IS '${agg.stamp}'`);
  console.log(`[timescale-objects] ok: ${agg.view} definition stamp`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const agg of AGGREGATES) await ensureAggregate(prisma, agg);
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

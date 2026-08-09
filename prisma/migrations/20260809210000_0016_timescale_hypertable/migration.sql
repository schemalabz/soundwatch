-- TimescaleDB adoption, part 1 of 2 (the transactional part).
--
-- Everything here runs inside Prisma's migration transaction. The continuous
-- aggregate + its policies CANNOT run in a transaction, so they live in
-- scripts/timescale-objects.ts, executed right after `prisma migrate deploy`
-- by the same services that run migrations (ingester CMD, sim-backfill).
--
-- Three changes, in dependency order:
--   1. naive timestamp(3) -> timestamptz(3). The naive columns held UTC wall
--      time by convention; the explicit `AT TIME ZONE 'UTC'` makes the
--      conversion correct regardless of the session timezone (the default
--      cast would reinterpret values in the session zone).
--   2. composite PK (sensor_id, recorded_at) replaces the surrogate id —
--      hypertables require the partition column in every unique constraint,
--      and the pair was already unique (readings_sensor_id_recorded_at_key).
--   3. create_hypertable with 7-day chunks. The fleet writes ~1 row per
--      sensor-minute (not the 1 Hz the original design doc assumed), so
--      1-day chunks would be needlessly tiny; 7 days ≈ 500k rows per chunk.
--      migrate_data moves existing rows into chunks (minutes at ~6.5M rows).
--
-- Deliberately NOT here (divergence from the design doc, on purpose):
--   - No raw-data retention policy: at 60s cadence raw is ~26M rows/year,
--     and the map's playback frames + the sensor pane read raw at arbitrary
--     depths. The doc's 24h raw retention assumed 1 Hz ingest.
--   - No compression policy yet: playback frames do random-access probes
--     across the whole history; measure before compressing.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 1. timestamptz conversions ------------------------------------------------

ALTER TABLE "sensors"
  ALTER COLUMN "last_seen_at"   TYPE TIMESTAMPTZ(3) USING "last_seen_at"   AT TIME ZONE 'UTC',
  ALTER COLUMN "provisioned_at" TYPE TIMESTAMPTZ(3) USING "provisioned_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "installed_at"   TYPE TIMESTAMPTZ(3) USING "installed_at"   AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at"     TYPE TIMESTAMPTZ(3) USING "created_at"     AT TIME ZONE 'UTC';

ALTER TABLE "planned_locations"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "frame_log_chunks"
  ALTER COLUMN "received_at" TYPE TIMESTAMPTZ(3) USING "received_at" AT TIME ZONE 'UTC';

ALTER TABLE "readings"
  ALTER COLUMN "recorded_at" TYPE TIMESTAMPTZ(3) USING "recorded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "received_at" TYPE TIMESTAMPTZ(3) USING "received_at" AT TIME ZONE 'UTC';

-- 2. composite primary key ---------------------------------------------------

ALTER TABLE "readings" DROP CONSTRAINT "readings_pkey";
ALTER TABLE "readings" DROP COLUMN "id";
DROP INDEX "readings_sensor_id_recorded_at_key"; -- a unique INDEX (Prisma @@unique), not a table constraint
ALTER TABLE "readings" ADD CONSTRAINT "readings_pkey" PRIMARY KEY ("sensor_id", "recorded_at");

-- 3. hypertable ---------------------------------------------------------------

SELECT create_hypertable(
  'readings',
  'recorded_at',
  chunk_time_interval => INTERVAL '7 days',
  migrate_data => true
);

-- Convert timestamp columns to timestamptz.
-- The app stores all timestamps in UTC, so existing naive `timestamp` values are
-- UTC wall-clock. The explicit `AT TIME ZONE 'UTC'` interprets them as UTC during
-- conversion; without it, Postgres would use the server's session timezone and
-- could shift every stored value.

-- AlterTable
ALTER TABLE "readings"
  ALTER COLUMN "recorded_at" TYPE TIMESTAMPTZ USING "recorded_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "sensors"
  ALTER COLUMN "last_seen_at" TYPE TIMESTAMPTZ USING "last_seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at"   TYPE TIMESTAMPTZ USING "created_at"   AT TIME ZONE 'UTC';

-- Make the (sensor, time) index covering for the level columns.
--
-- Playback frames (/api/frames), /api/departures and the sub-hour path of
-- /api/series read only laeq (and lmax_est) per (sensor, time range), but
-- each matching row cost a heap fetch of a ~800-byte row. Live inserts
-- interleave the sensors, so one sensor's rows for an hour sit on as many
-- heap pages as it has rows. On cold chunks that is where the seconds went.
--
-- With laeq and lmax_est carried in the index leaf, those queries become
-- index-only scans. Measured on the local stack (75 days, chunks clustered by
-- time like production), page reads from an empty cache:
--   frames, 6 x 1 h windows:   2155 -> 274
--   departures, one full day:  7754 -> 811
--
-- What it does NOT speed up:
--   - Live frames (by=received) filter on received_at, which is not in this
--     index. They read the last minutes, which are always in memory.
--   - Rows too new to be marked all-visible. An index-only scan still visits
--     the heap for those, and autovacuum reaches an insert-only chunk only
--     after it grows by about a fifth. Today's departures are mostly such
--     rows; what makes those cheap is the shared day in src/lib/server/usual.ts.
--     Closed chunks get the full gain after their first vacuum: run
--     `VACUUM readings` once after this lands.
--
-- The old index goes: the primary key already serves plain
-- (sensor_id, recorded_at) lookups, so keeping both would only cost writes.
-- Net size: about +25%.
--
-- Locking and deploy: CREATE INDEX blocks writes to readings while it builds
-- (locally, 5.2M rows: 8 s with a warm cache, 93 s cold), and for that long
-- this migration holds Prisma's advisory lock. The app and the ingester both
-- run `migrate deploy` at start and wait only ~10 s for that lock, so the
-- loser exits and is restarted until the build is done.
--
-- To avoid both, build the index by hand before deploying; every statement
-- here is IF [NOT] EXISTS, so the migration then finishes at once:
--
--   CREATE INDEX IF NOT EXISTS idx_readings_sensor_time_cover
--     ON readings (sensor_id, recorded_at DESC) INCLUDE (laeq, lmax_est)
--     WITH (timescaledb.transaction_per_chunk);
--
-- (transaction_per_chunk locks one chunk at a time; it cannot run inside a
-- transaction, which is why it is not used below.)
CREATE INDEX IF NOT EXISTS "idx_readings_sensor_time_cover"
  ON "readings" ("sensor_id", "recorded_at" DESC)
  INCLUDE ("laeq", "lmax_est");

DROP INDEX IF EXISTS "idx_readings_sensor_time";

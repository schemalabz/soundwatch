-- Make the (sensor, time) index covering for the level columns.
--
-- /api/frames, /api/departures and the sub-hour path of /api/series read only
-- laeq (and lmax_est) per (sensor, time range), but each matching row cost a
-- heap fetch of a ~800-byte row. Live inserts interleave the sensors, so one
-- sensor's rows for an hour sit on as many heap pages as it has rows. On cold
-- chunks that is where the seconds went.
--
-- With laeq and lmax_est carried in the index leaf, those queries become
-- index-only scans. Measured on the local stack (75 days, chunks clustered by
-- time like production), page reads from an empty cache:
--   frames, 6 x 1 h windows:   2155 -> 274
--   departures, one full day:  7754 -> 811
--
-- Same name and key columns as before, so schema.prisma's @@index still
-- describes it (Prisma cannot express INCLUDE). The old index goes: the
-- primary key already serves plain (sensor_id, recorded_at) lookups, so
-- keeping both would only cost writes. Net size: about +25%.
--
-- Index-only scans need the visibility map, which autovacuum maintains only
-- loosely on insert-only tables; closed chunks get it on their first vacuum.
-- A manual `VACUUM readings` after deploy makes the gain immediate.
--
-- Locking: CREATE INDEX blocks writes to readings while it builds (locally,
-- 5.2M rows: 8 s with a warm cache, 93 s cold). The new ingester runs this
-- migration before it subscribes; an old container still running during the
-- deploy has its inserts wait for the build. Devices store-and-forward, so a
-- stalled ingester delays readings rather than losing them.
CREATE INDEX "idx_readings_sensor_time_cover"
  ON "readings" ("sensor_id", "recorded_at" DESC)
  INCLUDE ("laeq", "lmax_est");

DROP INDEX "idx_readings_sensor_time";

ALTER INDEX "idx_readings_sensor_time_cover" RENAME TO "idx_readings_sensor_time";

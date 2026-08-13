-- Order by received_at, never recorded_at.
--
-- Device clocks drift up to ~10 minutes FORWARD between NTP syncs and jump back
-- on resync, so the device clock cannot decide which reading is "latest" — it
-- manufactures phantom duplicate devices, reboots and stall storms. Every
-- latest-reading probe (/api/sensors, /api/freshness, /api/status) and the
-- readings endpoint therefore order on received_at.
--
-- Nothing indexed it. The existing index is (sensor_id, recorded_at DESC) and
-- the primary key is (sensor_id, recorded_at), so each of those per-sensor
-- probes was a sort. This is the covering index for that access pattern.
CREATE INDEX IF NOT EXISTS "idx_readings_sensor_received"
  ON "readings" ("sensor_id", "received_at" DESC);

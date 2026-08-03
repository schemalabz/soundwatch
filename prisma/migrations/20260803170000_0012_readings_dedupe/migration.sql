-- Replay duplicates: store-and-forward re-publishes create identical
-- (sensor_id, recorded_at) rows; at 30s cadence no legitimate duplicate
-- exists. They have twice poisoned lag()-based analytics (phantom reboots,
-- impossible stall counts). Clean existing dupes keeping the FIRST arrival,
-- then constrain so they can never return.
DELETE FROM "readings" a USING "readings" b
  WHERE a.sensor_id = b.sensor_id
    AND a.recorded_at = b.recorded_at
    AND a.id > b.id;
CREATE UNIQUE INDEX "readings_sensor_id_recorded_at_key"
  ON "readings"("sensor_id", "recorded_at");

-- Phase 1: make `readings` a TimescaleDB hypertable with rollups + retention.
-- Requires the timescaledb extension (migration 0005).

-- 1) Switch the primary key from the surrogate `id` to (sensor_id, recorded_at).
--    A hypertable's unique constraint must include the time column.
ALTER TABLE "readings" DROP CONSTRAINT "readings_pkey";
ALTER TABLE "readings" DROP COLUMN "id";
ALTER TABLE "readings" ADD CONSTRAINT "readings_pkey" PRIMARY KEY ("sensor_id", "recorded_at");

-- Keep idx_readings_sensor_time (sensor_id, recorded_at DESC): the ascending PK
-- cannot serve "latest reading per sensor" (the map) efficiently — that needs a
-- descending index, or the query full-scans every row. Timescale propagates it
-- to each chunk automatically.

-- 2) Convert to a hypertable, 1-day chunks. migrate_data moves any existing rows.
SELECT create_hypertable('readings', 'recorded_at',
  chunk_time_interval => INTERVAL '1 day', migrate_data => true);

-- 3) Retention: keep raw 1-second data for 24h (rollups below keep the history).
SELECT add_retention_policy('readings', INTERVAL '24 hours');

-- 4) 1-minute rollup. Noise is logarithmic, so it is averaged in the ENERGY
--    domain (LAeq); linear metrics use plain avg.
CREATE MATERIALIZED VIEW readings_1m
WITH (timescaledb.continuous) AS
SELECT
  sensor_id,
  time_bucket('1 minute', recorded_at) AS bucket,
  10 * log(avg(power(10::float8, noise_dba / 10))) AS noise_laeq,
  min(noise_dba) AS noise_min,
  max(noise_dba) AS noise_max,
  avg(temperature)  AS temperature,
  avg(humidity)     AS humidity,
  avg(light_lux)    AS light_lux,
  avg(pressure_pa)  AS pressure_pa,
  avg(pm1) AS pm1, avg(pm25) AS pm25, avg(pm4) AS pm4, avg(pm10) AS pm10,
  avg(uv_a) AS uv_a, avg(uv_b) AS uv_b, avg(uv_c) AS uv_c,
  avg(battery) AS battery
FROM readings
GROUP BY sensor_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1m',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

SELECT add_retention_policy('readings_1m', INTERVAL '30 days');

-- 5) 1-hour rollup (kept long-term; no retention policy).
CREATE MATERIALIZED VIEW readings_1h
WITH (timescaledb.continuous) AS
SELECT
  sensor_id,
  time_bucket('1 hour', recorded_at) AS bucket,
  10 * log(avg(power(10::float8, noise_dba / 10))) AS noise_laeq,
  min(noise_dba) AS noise_min,
  max(noise_dba) AS noise_max,
  avg(temperature)  AS temperature,
  avg(humidity)     AS humidity,
  avg(light_lux)    AS light_lux,
  avg(pressure_pa)  AS pressure_pa,
  avg(pm1) AS pm1, avg(pm25) AS pm25, avg(pm4) AS pm4, avg(pm10) AS pm10,
  avg(uv_a) AS uv_a, avg(uv_b) AS uv_b, avg(uv_c) AS uv_c,
  avg(battery) AS battery
FROM readings
GROUP BY sensor_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset => INTERVAL '6 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

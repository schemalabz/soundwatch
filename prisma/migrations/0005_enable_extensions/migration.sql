-- Enable database extensions. Requires a Postgres image that ships them
-- (timescale/timescaledb-ha bundles both); plain postgres:17 does not.
-- TimescaleDB also needs shared_preload_libraries='timescaledb', which the
-- timescaledb-ha image sets by default.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;

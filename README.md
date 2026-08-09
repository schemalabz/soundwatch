# Soundwatch

Citizen noise-monitoring network for Athens — 50 SmartCitizen-based sensors
streaming sound levels over MQTT to [soundwatch.gr](https://soundwatch.gr).

Architecture and operations are documented in [docs/architecture-current.md](docs/architecture-current.md)
and [docs/infrastructure.md](docs/infrastructure.md).

## Local full stack (no hardware needed)

One command brings up the entire pipeline — Postgres, Mosquitto (prod config,
ACL included), the MQTT ingester, the web app, and a 50-sensor simulator that
backfills 90 days of history and then streams live readings:

```bash
npm run local:up
```

First run builds images and backfills ~6M readings (~5-6 min; the command
streams backfill progress and exits when it completes — the stack keeps
running). Then:

- http://localhost:3005 — pipeline freshness dashboard
- http://localhost:3005/admin — admin (token `admin-local`)
- `psql postgresql://soundwatch:soundwatch@localhost:5432/soundwatch`

Re-running `local:up` is cheap: the backfill is idempotent and only tops up
the gap since the last run. Other commands: `npm run local:logs`,
`local:down`, `local:nuke` (also deletes data).

Knobs (env vars): `SIM_INTERVAL_S` (live cadence, default 5s),
`SIM_BACKFILL_DAYS` (default 90), `SIM_BACKFILL_INTERVAL_S` (default 60),
`SIM_SEED` (change all randomness), `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
(only needed for the install-flow map picker).

The simulated data is deterministic and realistic: per-neighborhood base
levels, archetype diurnal curves (nightlife/commercial/arterial/residential),
weekday/weekend contrast, sporadic loud events, and sensor outages (units
occasionally go dark for 1 minute to 10 days; a few units are chronically
flaky, most are solid) — see `simulator/`.

## Host-mode development

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + mosquitto only
npx prisma migrate deploy
npm run sim:backfill   # seed + backfill (idempotent)
npm run ingester       # terminal 2
npm run sim:live       # terminal 3
npm run dev            # terminal 4 -> localhost:3000
```

`.env` is loaded by all tsx scripts if present (see `.env.example`).

## TimescaleDB

`readings` is a Timescale hypertable (7-day chunks), and the dashboard's
heavy endpoints read `readings_hour_bins` — a continuous aggregate of
per-(sensor, hour, 1-dB bin) counts/energy/Lmax that serves `/api/series`,
`/api/aggregate` and `/api/status` in milliseconds where raw scans took
seconds. Split in two because Prisma wraps migrations in a transaction and
cagg DDL refuses to run in one:

- `prisma/migrations/..._0016_timescale_hypertable` — extension, composite
  PK `(sensor_id, recorded_at)`, `timestamptz` conversion, hypertable.
- `scripts/timescale-objects.ts` — the cagg + refresh policy (Timescale's
  own job scheduler; no external cron). Idempotent; runs automatically
  after `prisma migrate deploy` in the ingester and sim-backfill startup
  commands, or by hand: `npm run db:timescale`.

The database image must ship the extension (`timescale/timescaledb`, as in
all compose files). Raw readings are kept indefinitely (no retention or
compression policy yet): at ~1 row/sensor-minute raw is small, and playback
frames + the sensor pane read it at arbitrary depths.

## Tests

```bash
npm test         # vitest: ingester parsers + simulator model round-trips
npm run lint
npx tsc --noEmit
```

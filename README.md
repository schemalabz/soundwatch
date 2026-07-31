# Soundwatch

Open-source platform for the [soundwatch.gr](https://soundwatch.gr) environmental
sensor network — a Next.js app that ingests sensor readings, stores them in
PostgreSQL/TimescaleDB, and serves a noise map and charts.

## Local development

### Prerequisites

- Node.js 20+ (22 recommended)
- Docker (for the database and MQTT broker)

### Setup

```bash
npm install
cp .env.example .env          # then fill in values (see below)

# Start Postgres (TimescaleDB + PostGIS) and the Mosquitto MQTT broker
docker compose -f docker-compose.dev.yml up -d

# Create the schema (tables, hypertable, rollups, extensions)
npx prisma migrate deploy
npx prisma generate

# Seed sensors + sample data (see "Seeding" below)
npm run seed

# Run the app
npm run dev
```

`.env` values:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection (matches `docker-compose.dev.yml`) |
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` for the local broker |
| `NEXT_PUBLIC_BASE_URL` | The app's own URL, e.g. `http://localhost:3000`. Used by server-side fetches — set it to the port you actually run on. |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | A Mapbox **public** token (`pk.…`). Without it the map is blank. |

> The dev npm scripts (`seed`, `backfill`, `ingester`, `simulate`) auto-load
> `.env`, so you don't need to export `DATABASE_URL` manually.

## Seeding & sample data

`npm run seed` populates the database. It has two modes:

| Command | What it creates | Time |
|---|---|---|
| `npm run seed` / `npm run seed -- minimal` | 15 named sensors + 24h of per-minute readings | ~2 s |
| `npm run seed -- full` | 50 sensors + a realistic **3-month** dataset (~6.6M rows): 24h of raw 1-second data, 30 days of per-minute rollups, 90 days of per-hour rollups | ~60–80 s |

There's also a lower-level backfill tool for ad-hoc volume:

```bash
npm run backfill                 # last 24h at 1/sec for all sensors
npm run backfill -- <hoursBack> [stepSeconds] [untilHoursBack]
npm run backfill -- 720 60 24    # days 1-30 at 1/min
```

### How the data is stored

`readings` is a TimescaleDB hypertable. To keep it small, only the **last 24h**
of raw 1-second data is kept; older history lives in continuous-aggregate
rollups:

| Source | Resolution | Retention |
|---|---|---|
| `readings` | 1 second | 24 hours |
| `readings_1m` | 1 minute | 30 days |
| `readings_1h` | 1 hour | long-term |

The readings API picks the right tier automatically based on the requested range.

## Erasing & repopulating the database

`seed`/`backfill` only insert **data** — the **schema** (tables, hypertable,
rollups, extensions) comes from migrations. So to wipe and repopulate:

**Reset schema + data, keep the container/volume:**

```bash
npx prisma migrate reset --force --skip-seed   # drops everything, re-applies migrations
npm run seed -- full                           # repopulate
```

**Wipe the volume entirely (fresh database):**

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy                       # recreate the schema
npm run seed -- full                            # repopulate
```

In both cases: **migrations first, then seed/backfill.** Running `backfill` alone
on an empty database fails, because the `readings` hypertable doesn't exist yet.

# Soundwatch — server, API and web app

Noise-monitoring sensors around Athens: a fleet of SmartCitizen Kit 2.3 units publish acoustic measurements over MQTT, this repo ingests them, computes every level and statistic, stores them, and serves the map, charts and admin.

**If you are about to display, query or reason about the data, read [`measurement-contract.md` in the firmware repo](https://github.com/schemalabz/soundwatch-firmware/blob/main/docs/soundwatch/measurement-contract.md) first.** It is the contract for what the numbers mean, what is validated, and where they lie. Two things from it that catch everyone:

- **The levels are not calibrated sound pressure.** Every dB value is *device-dB* with an arbitrary zero. "68" is not 68 dB(A) and must never be labelled or compared as though it were.
- **`l10` saturates at 88–90.** The top histogram bin is open-ended, so percentiles cannot report above it — a chart built on raw `l10` goes flat and calm at exactly the loudest moments.

## The two repositories

The system spans two repos, and a doc lives with the code that would invalidate it.

| | [`soundwatch`](.) (here) | [`soundwatch-firmware`](https://github.com/schemalabz/soundwatch-firmware) |
|---|---|---|
| owns | ingester, database, API, web app, deployment | device firmware, what the sensor measures, fleet operations |
| read for | how a reading becomes a row, what the API serves, how prod runs | **what a number means**, release/flashing, provisioning, field gotchas |
| index | this file → [`docs/`](docs/) | [its README](https://github.com/schemalabz/soundwatch-firmware) → [`docs/soundwatch/README.md`](https://github.com/schemalabz/soundwatch-firmware/blob/main/docs/soundwatch/README.md) |

The measurement contract lives *there* because its claims break when firmware changes — bin edges, sentinels and clamps are device behaviour. The server-side formulas are in it too, because on this system **the device ships raw integers and the server does all the maths**, so the formulas are the definition rather than a reimplementation.

## Building the frontend?

Read the measurement contract above first — the whole of "Read this first" and "Known distortions". Then, concretely:

- **Never label an axis dB(A)** or compare a value to a legal limit. Uncalibrated device-dB, arbitrary zero. Within-unit comparison over time is the strongest honest claim; between-unit spread is ~1.8 dB before any calibration.
- **`l10` is censored at the top.** Histogram bin 29 is `[88, ∞)`, so a loud interval reports ~88.7 whatever the truth — measured up to 12 dB low. Render it as "≥88" when the top bin is occupied rather than as a confident number.
- **Never average percentiles** across time buckets. Sum the `hist_raw` bin counts and recompute.
- **`lmax_est` is one 11.6 ms frame**, not a standards Fast maximum — it overstates by 2.3–4.7 dB.
- **The 21 bands are un-weighted** while LAeq and the histogram are A-weighted. Never plot a band against LAeq; the top bands are largely the sensor's own noise floor.
- **Exclude `is_experimental` sensors** from anything public or aggregate.
- `payload_version` **below 4** is a lower bound above ~65 device-dB — those readings were captured before the level-clamp fix.

The public readings API is served and documented: **`/api/docs`** (Scalar UI over `/api/openapi.json`), generated from the zod schemas in `src/lib/api/schemas.ts`.

## The shape of it

```
sensor (SAMD21 + ESP8266)              custom firmware, mic → FFT → integer accumulators
   │  MQTT  device/sck/<token>/readings/raw     stock payload format, NOT valid JSON
   ▼
Mosquitto                              1883 public (ACL, token-as-secret) · 1884 internal
   ▼
mqtt-ingester/                         parse → compute levels → insert. The only writer.
   ▼
PostgreSQL + TimescaleDB               sensors · readings (hypertable) · readings_hour_bins
   ▼                                   planned_locations · frame_log_chunks
src/app/api/                           Next.js App Router — public API + dashboard endpoints
   ▼
src/components/dashboard/              map, timebar playback, leaderboard, charts
```

## Running it

The whole pipeline, no hardware needed — Postgres, Mosquitto (prod config, ACL
included), the ingester, the web app, and a 50-sensor simulator that backfills 90 days
of history and then streams live readings:

```bash
npm run local:up
```

First run builds images and backfills ~6M readings (~5-6 min; the command streams
backfill progress and exits when it completes — the stack keeps running). Then:

- http://localhost:3005 — the dashboard
- http://localhost:3005/status — network status
- http://localhost:3005/admin — admin (token `admin-local`)
- `psql postgresql://soundwatch:soundwatch@localhost:5432/soundwatch`

Re-running `local:up` is cheap: the backfill is idempotent and only tops up the gap
since the last run. Other commands: `npm run local:logs`, `local:down`, `local:nuke`
(also deletes data).

Knobs (env vars): `SIM_INTERVAL_S` (live cadence, default 5s), `SIM_BACKFILL_DAYS`
(default 90), `SIM_BACKFILL_INTERVAL_S` (default 60), `SIM_SEED` (change all
randomness), `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (needed for the map).

### Host-mode development

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + mosquitto only
npx prisma migrate deploy
npm run db:timescale   # continuous aggregate (cannot run inside a migration)
npm run sim:backfill   # seed + backfill (idempotent)
npm run ingester       # terminal 2
npm run sim:live       # terminal 3
npm run dev            # terminal 4 -> localhost:3000
```

`.env` is loaded by all tsx scripts if present (see `.env.example`).

### Getting data to look at

`npm run seed` gives you sensors on the map but **no readings**, so every view renders
empty. Three ways to fix that:

- **`simulator/` — the default, and what `npm run local:up` runs.** It speaks the stock
  firmware dialect (`device/sck/<token>/readings/raw`, non-JSON) and builds rows through
  the *real* ingester code, so simulated and field rows are derived by the same
  functions. The data is deterministic and realistic: per-neighborhood base levels,
  archetype diurnal curves (nightlife/commercial/arterial/residential), weekday/weekend
  contrast, sporadic loud events, sensor outages (units go dark for 1 minute to 10
  days), a per-unit calibration offset and device clock drift. It emits firmware 1.1's
  `payload_version` 4.
- **A sanitised database dump.** Workable, but see the warning below — a raw dump is a
  credential leak.
- **Point a real bench unit at your machine.** Highest fidelity, needs hardware and the
  unit reconfigured to your broker.

> **A production dump is not safe to hand out as-is.** `sensors.device_id` **is** the device's MQTT credential — the broker authorises on it (`token-as-secret`, ACL `device/sck/%c/#`). Anyone holding it can publish as that sensor. Rewrite `device_id` to synthetic values before sharing a dump, the same reason `provisioning-log.csv` is gitignored.

## TimescaleDB

`readings` is a Timescale hypertable (7-day chunks), and the dashboard's heavy
endpoints read `readings_hour_bins` — a continuous aggregate of per-(sensor, hour, 1-dB
bin) counts/energy/Lmax that serves `/api/series`, `/api/aggregate` and `/api/status` in
milliseconds where raw scans took seconds. Split in two because Prisma wraps migrations
in a transaction and continuous-aggregate DDL refuses to run in one:

- `prisma/migrations/..._0016_timescale_hypertable` — extension, composite PK
  `(sensor_id, recorded_at)`, `timestamptz` conversion, hypertable.
- `scripts/timescale-objects.ts` — the aggregate + refresh policy (Timescale's own job
  scheduler; no external cron). Idempotent, and it **rebuilds the aggregate when its bin
  definition changes**. Runs automatically after `prisma migrate deploy` in the ingester
  and sim-backfill startup commands, or by hand: `npm run db:timescale`.

The database image must ship the extension (`timescale/timescaledb`, as in all compose
files). Raw readings are kept indefinitely (no retention or compression policy yet): at
~1 row/sensor-minute raw is small, and playback frames + the sensor pane read it at
arbitrary depths.

## Layout

| path | what |
|---|---|
| `mqtt-ingester/` | The subscriber. `parser.ts` tokenises the non-JSON payload; `row.ts` derives a full row (shared with the simulator); `flavor1.ts` computes LAeq and duty; `flavor2.ts` percentiles and bands; `diagnostics.ts` unpacks device health; `framelog.ts` the SD-card frame-log chunks |
| `simulator/` | The 50-sensor fleet simulator: `model.ts` the acoustic model, `payload.ts` the stock wire dialect, `backfill.ts` bulk history, `live.ts` the MQTT streamer |
| `prisma/` | Schema and migrations. The ingester applies pending migrations on boot — it is the only writer, so it owns schema convergence |
| `src/app/api/` | Public routes (`sensors`, `openapi.json`, `docs`) and dashboard endpoints (`frames`, `series`, `aggregate`, `status`, `freshness`) |
| `src/components/dashboard/` | The dashboard: map + timebar playback, leaderboard, charts, sensor pane |
| `src/lib/api/` | zod schemas, the shared reading serializer, the OpenAPI document |
| `scripts/` | `prod-sql.sh` read-only production queries · `framelog-pull.sh` nightly frame-log collection (cron) · `fetch-framelog.ts` the pull pacer · `framelog-probe.ts` device throughput measurement · `prod-backup.sh` · `timescale-objects.ts` |
| `docs/` | [`architecture-current.md`](docs/architecture-current.md) pipeline, wire contract, schema · [`infrastructure.md`](docs/infrastructure.md) deployment, broker, identity · `installation/` hardware BOM and wiring |

## Tests

```bash
npm test         # vitest: ingester parsers, simulator model, dashboard math, API schemas
npm run lint
npx tsc --noEmit
```

## Production

Coolify on a DigitalOcean droplet; a push to `main` deploys. Read-only production queries:

```sh
scripts/prod-sql.sh "select count(*) from readings;"
```

Two rules that have each cost real time:

- **Order by `received_at`, never `recorded_at`.** Device clocks run *ahead* — measured up to 35 minutes — and jump back on NTP resync, so sorting by device time manufactures phantom duplicate devices and reboots. (Filtering a window on `recorded_at` is correct — that is when the sound happened. Only *ordering* must use `received_at`.)
- **Bench units carry `sensors.is_experimental = true`** and must be excluded from anything public or aggregate.

Deployment topology, the two-listener broker model and the backup runbook are in [`docs/infrastructure.md`](docs/infrastructure.md).

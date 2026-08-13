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

The readings API does not yet expose most of this (no percentiles, bands, histogram or duty) and is being widened, with OpenAPI, in parallel. Until that lands, read the schema in `prisma/schema.prisma` — the column comments are informative — and query with `scripts/prod-sql.sh`.

## The shape of it

```
sensor (SAMD21 + ESP8266)              custom firmware, mic → FFT → integer accumulators
   │  MQTT  device/sck/<token>/readings/raw     stock payload format, NOT valid JSON
   ▼
Mosquitto                              1883 public (ACL, token-as-secret) · 1884 internal
   ▼
mqtt-ingester/                         parse → compute levels → insert. The only writer.
   ▼
PostgreSQL (Prisma)                    sensors · readings · planned_locations · frame_log_chunks
   ▼
src/app/api/                           Next.js App Router
   ▼
src/                                   map, charts, admin
```

## Running it

```sh
nix develop                            # or use your own node 22
docker compose -f docker-compose.dev.yml up -d   # postgres + mosquitto
npx prisma migrate dev
npm run dev                            # web app
npm run ingester                       # subscriber, in a second shell
npm run seed                           # 15 Athens sensor rows (locations only, no readings)
npm test                               # vitest
```

### Getting data to look at

`npm run seed` gives you sensors on the map but **no readings**, so charts, the leaderboard and sensor detail render empty. There are three ways to fix that, and the first one is currently broken:

- **`npm run simulate` does not work.** It publishes the pre-rebuild dialect (`soundwatch/sensors/<id>/readings`, JSON) and the ingester now speaks only the stock firmware dialect (`device/sck/<token>/readings/raw`, non-JSON). The messages are silently ignored — nothing errors, nothing lands. Its own header says so. Making it emit the stock format again (see `mqtt-ingester/parser.ts` and `STOCK_SENSOR_ID_MAP`) is the cleanest fix and unblocks all local frontend work.
- **A sanitised database dump.** Workable, but see the warning below — a raw dump is a credential leak.
- **Point a real bench unit at your machine.** Highest fidelity, needs hardware and the unit reconfigured to your broker.

> **A production dump is not safe to hand out as-is.** `sensors.device_id` **is** the device's MQTT credential — the broker authorises on it (`token-as-secret`, ACL `device/sck/%c/#`). Anyone holding it can publish as that sensor. Rewrite `device_id` to synthetic values before sharing a dump, the same reason `provisioning-log.csv` is gitignored.

## Layout

| path | what |
|---|---|
| `mqtt-ingester/` | The subscriber. `parser.ts` tokenises the non-JSON payload; `flavor1.ts` computes LAeq and duty; `flavor2.ts` percentiles and bands; `diagnostics.ts` unpacks device health; `framelog.ts` the SD-card frame-log chunks |
| `prisma/` | Schema and migrations. The ingester applies pending migrations on boot — it is the only writer, so it owns schema convergence |
| `src/app/api/` | Public and admin routes |
| `scripts/` | `prod-sql.sh` read-only production queries · `framelog-pull.sh` nightly frame-log collection (cron) · `fetch-framelog.ts` the pull pacer · `framelog-probe.ts` device throughput measurement · `prod-backup.sh` |
| `docs/` | [`architecture-current.md`](docs/architecture-current.md) pipeline, wire contract, schema · [`infrastructure.md`](docs/infrastructure.md) deployment, broker, identity · `installation/` hardware BOM and wiring |

## Production

Coolify on a DigitalOcean droplet; a push to `main` deploys. Read-only production queries:

```sh
scripts/prod-sql.sh "select count(*) from readings;"
```

Two rules that have each cost real time:

- **Order by `received_at`, never `recorded_at`.** Device clocks run *ahead* — measured up to 35 minutes — and jump back on NTP resync, so sorting by device time manufactures phantom duplicate devices and reboots.
- **Bench units carry `sensors.is_experimental = true`** and must be excluded from anything public or aggregate.

Deployment topology, the two-listener broker model and the backup runbook are in [`docs/infrastructure.md`](docs/infrastructure.md).

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
| index | this file → [`docs/`](docs/) | [`docs/soundwatch/README.md`](https://github.com/schemalabz/soundwatch-firmware/blob/main/docs/soundwatch/README.md) |

The measurement contract lives *there* because its claims break when firmware changes — bin edges, sentinels and clamps are device behaviour. The server-side formulas are in it too, because on this system **the device ships raw integers and the server does all the maths**, so the formulas are the definition rather than a reimplementation.

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
npm run simulate                       # fake device, if you have no hardware
npm test                               # vitest
```

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

# Backend infrastructure

What runs where, what is exposed, and how a sound measurement gets from a sensor
to the database. Current as of 2026-08-02, after the prod cutover.

Companion docs: `architecture-current.md` (system overview),
firmware repo `docs/soundwatch/provisioning-and-identity.md` (how devices are
provisioned and identified).

## Deployment topology

Everything runs on one DigitalOcean droplet (`188.166.164.198`, 2 vCPU / 2 GB),
managed by **Coolify**, which deploys `schemalabz/soundwatch` branch `main` via
docker-compose. Pushing to `main` triggers a rebuild.

```mermaid
flowchart LR
  subgraph net["the internet"]
    S1["sensor<br/>token = bench2"]
    S2["sensor<br/>token = bench3"]
    U["browser"]
  end

  subgraph droplet["droplet — Coolify-managed compose network"]
    MQ["<b>mosquitto</b><br/>:1883 public, ACL<br/>:1884 internal, no ACL"]
    IN["<b>mqtt-ingester</b><br/>parses payload,<br/>computes LAeq/percentiles"]
    PG[("<b>postgres</b><br/>timescaledb pg17")]
    APP["<b>Next.js app</b><br/>:3000"]
  end

  S1 -->|"publish :1883"| MQ
  S2 -->|"publish :1883"| MQ
  MQ -->|"subscribe :1884"| IN
  IN -->|"write"| PG
  APP -->|"read"| PG
  U -->|"https"| APP
```

**Only two ports are published to the host: `3000` (app) and `1883` (devices).**
Postgres and listener 1884 are reachable only from inside the compose network.

## The two MQTT listeners — and why

This is the security model, so it is worth understanding rather than copying.

| | 1883 | 1884 |
|---|---|---|
| Exposed to internet | **yes** | **no** — not in any `ports:` |
| Anonymous | yes | yes |
| ACL | **`pattern readwrite device/sck/%c/#`** | none |
| Who uses it | sensors | ingester and any backend service |

**Why devices are confined.** The firmware sends no username/password — the MQTT
**client-id is the token**. `%c` expands to that client-id, so a device can only
read and write its own subtree. A leaked token exposes exactly one device: it
cannot read another unit's data, forge readings in its name, or reach another
unit's `cmd` topic (which triggers remote config and OTA).

**Why a second listener exists.** The ingester must subscribe to
`device/sck/+/readings/raw` — a wildcard across every device — which the device
ACL correctly forbids. Rather than issue and rotate broker credentials for
backend services, they get a listener with no route from outside. **The
protection is network-level, not auth-level** — exactly how postgres is already
protected.

> ⚠️ **Never add 1884 to a `ports:` section.** One line would grant the internet
> unrestricted read/write across every device topic, including OTA commands.
> Nothing in the config prevents this; it is a convention you have to keep.

**This was observed working.** During the cutover an ingester on 1883 and one on
1884 ran simultaneously for ~90 s: the 1883 one stored **0** readings (wildcard
denied), the 1884 one stored **2**. No duplicates, no gap.

TLS (8883) was removed. The ESP8266 firmware uses a plain `WiFiClient`, so no
device could ever use it — it was theatre while 1883 sat open. Reinstate it when
the firmware can speak TLS. **Traffic today is unencrypted: this is containment,
not confidentiality.**

## How a reading becomes a row

```mermaid
sequenceDiagram
    participant D as device
    participant M as mosquitto :1883
    participant I as ingester :1884
    participant P as postgres

    D->>M: device/sck/<token>/readings/raw<br/>{t, 236:energy_sum, 237:frames, 241:hist, 242:bands, 243:health…}
    M->>I: delivered (wildcard subscribe)
    Note over I: deviceId comes from the TOPIC
    Note over I: LAeq = 10·log10(energy_sum/frames)<br/>percentiles from histogram<br/>bands → dB<br/>health telemetry unpacked
    I->>P: upsert sensor, insert reading
```

The device sends **raw integer accumulators**; every logarithm and statistic is
computed server-side. That is deliberate: energies are additive, so intervals can
be merged losslessly, and any new metric can be re-derived from stored rows
without touching firmware.

## What is stored per reading

| group | columns |
|---|---|
| identity / time | `sensor_id`, `recorded_at` (device clock), `received_at` (server clock — distinguishes replayed backlog from live data) |
| raw accumulators | `energy_sum`, `frame_count`, `interval_s`, `max_energy`, `min_energy`, `payload_version` |
| computed levels | `laeq`, `realized_duty`, `lmax_est`, `lmin_est` |
| spectrum | `hist_raw`, `bands_raw` (verbatim, for reprocessing) · `l10`, `l50`, `l90` · `bands_db` (21 values) |
| **device health** | `device_uptime_s`, `free_heap_bytes`, `reset_cause`, `wifi_connects`, `publish_fails`, `capture_fails` |
| environment | temperature, humidity, pressure, light, UV, PM, battery, RSSI, SD |

**On `reset_cause`:** 32 = watchdog. 64 = "SYST", which covers **both** a software
reset and a power cycle, because the UF2 bootloader resets before the app runs.
64 cannot distinguish "lost power" from "reset itself".

## Identity

```mermaid
flowchart TD
  HW["<b>hardware id</b><br/>618E7DEC5030…<br/>burned into the SAMD21<br/><i>immutable</i>"]
  TOK["<b>token</b><br/>6 chars<br/>= MQTT client-id<br/>= the only credential"]
  ROW[("<b>sensors row</b><br/>device_id = token<br/>hardware_id<br/>lat/long, name")]
  TOK -->|"topic + auth"| ROW
  HW -.->|"self-reported on<br/>device/sck/&lt;token&gt;/info"| ROW
```

The token is **simultaneously the name, the address and the password**. The
hardware id is reported by the device and stored so you can answer "which
physical box is this?" and detect units swapped during installation.

**Note:** `device/inventory` carries the hardware id but **no token**, so it is
unattributable. Only `device/sck/<token>/info` — where the topic carries the
token — can link the two.

### Known limitations at scale

- **Sensors are auto-created.** Any token that publishes gets a row, so a typo at
  provisioning silently creates a phantom sensor.
- **Rotating a token orphans history**, because `device_id` *is* the identity.
- **6-character tokens** (`char token[7]`) are the sole credential.
- **No installation history** — a unit moved between locations leaves no record.

Direction of travel: physical device (hardware id) / credential (token, rotatable)
/ installation (device at location over a date range) as three separate things.

## Operational notes

- **Migrations run automatically** — the ingester applies `prisma migrate deploy`
  before starting, so a deploy converges the schema and a fresh volume rebuilds
  from zero.
- **Deploying = pushing to `main`.** A GitHub webhook triggers Coolify.
- **Devices buffer and replay.** If the broker is unreachable a device stores
  readings to flash and replays on reconnect — so `received_at` can be far later
  than `recorded_at`.
- **Headroom is tight.** ~870 MB free of 1967 MB. Next.js builds are the pressure.
- **Nightly DB backups run on the droplet** — 03:15 UTC, `-Fc` dumps, 14-day
  rotation, installed and driven by `scripts/prod-backup.sh` (install/run/
  status/fetch). Dumps live on the droplet only; fetch them periodically.
- **Tokens are minted server-side** in the admin provisioning flow (16-char);
  `onboard.sh` registers every unit with the backend before flashing.

## Not yet built

- Alerting when a device goes silent (`last_seen_at` exists; nothing watches it)
- Timescale hypertables / continuous aggregates / retention
- Frame-log retention — nothing expires `frame_log_chunks`; at fleet scale it
  grows ~13.6 GB/month against 38 GB free. Decide before the fleet grows,
  not at 90 % full
- `laeq` named as `laeq` in the UI (currently surfaced under the legacy
  `noiseDba` key so existing views keep working)

# Soundwatch — Current Software & Backend Architecture

> **Status:** working reference, 2026-07-30. Written for the team to understand where the system is right now — after the incremental rebuild (Steps 0–3) and the measurement experiments (Flavors 1–3). Companion history lives in the firmware repo's `docs/soundwatch/` (architecture-reference, execution plan, foundation-ready).

## 1. The system in one picture

```
SCK 2.3 sensor (SAMD21 "SAM" + ESP8266 "ESP", custom firmware — fork of fablabbcn/smartcitizen-kit-2x)
   │  SAM: mic → continuous 512-pt FFT → energy accumulators + histogram + bands (integer-only)
   │  ESP: WiFi + MQTT transport (plaintext, client-id = device token)
   ▼  MQTT: device/sck/<token>/readings/raw   payload {t:<iso>,<id>:<value>,...}
Mosquitto broker (ours)
   ▼  subscribe device/sck/+/readings/raw
mqtt-ingester (TypeScript, long-running)
   │  parse stock payload → map numeric ids → compute LAeq, realized_duty, L10/L50/L90, band dB
   ▼  Prisma insert (typed columns, raw packed strings kept)
PostgreSQL (TimescaleDB-capable image, plain PG usage for now)
   ▼  Prisma queries
Next.js API routes  → /api/sensors, /api/sensors/[id]/readings, admin, firmware
   ▼
React frontend — Mapbox map, Recharts charts, leaderboard (i18n: el/en)
```

Design principle that got us here: **thinnest vertical slice, validated end-to-end before the next change** — the device side stays as close to stock as each step allows, and all schema/log math lives on the server.

## 2. Tech stack

| Layer | Technology | Where | Notes |
|---|---|---|---|
| Sensor hardware | SmartCitizen Kit 2.3 (SAMD21 Cortex-M0+ 48MHz 32KB RAM + ESP8266) | bench units | hardware is fixed — no Path-B/other-chip plans |
| Firmware | C++ / Arduino, PlatformIO (atmelsam@8.1.0, framework vendored in-repo) | `soundwatch-firmware` fork | base pinned at `baseline/stock-2026-07` (= upstream master + PR#107 WiFi fixes); feature work in `flavor-*` branches |
| Firmware dev env | Nix flake devshell (platformio-core, python3, pyserial) | firmware repo | flash = UF2 drag-copy (SAM) / serial (ESP); headless workflow documented in `docs/soundwatch/tools/` |
| Broker | Mosquitto 2.x | Docker (prod compose) / nix (bench) | plaintext **1883 (public, ACL `device/sck/%c/#`)** + **1884 (internal, unpublished)** for backend services; token-as-secret, mirrors SmartCitizen; TLS removed — the firmware cannot speak it. See `infrastructure.md` |
| Ingester | TypeScript, `mqtt` v5, tsx runtime | umbrella repo `mqtt-ingester/` | one subscriber, parse → compute → insert; unit-tested (vitest, 28 tests) |
| ORM / migrations | Prisma 5.22 | `prisma/` | migrations `0001`–`0006` |
| Database | `timescale/timescaledb:latest-pg17` (PG 17) | Docker | **plain Postgres usage today** — hypertables/continuous aggregates/retention are the planned Step 6; the image choice makes that a no-migration switch |
| Web app | Next.js 16.2, React 19.2, Mapbox GL, Recharts, next-intl | umbrella repo `src/` | map + leaderboard + charts + admin; reads DB via Prisma |
| Prod hosting | Coolify on a DigitalOcean droplet (`188.166.164.198`, `soundwatch.gr` / `mqtt.soundwatch.gr`) | deploys `schemalabz/soundwatch:main` via docker-compose | **prod still runs the pre-rebuild iteration; cutover is staged & gated** (fresh-DB reset; old data backed up + restore-verified) |
| Bench pipeline | local Mosquitto + Postgres + ingester + Next dev | dev machine | where all validation happens; prod untouched by the experiments |

## 3. The wire contract (device → server)

Topic: `device/sck/<token>/readings/raw`. The payload is the stock SmartCitizen format — **not JSON** (unquoted keys, unquoted ISO timestamp): `{t:2026-07-29T14:20:10Z,55:38.03,236:461524839,...}`. The ingester has a custom tokenizer (split on `,`, then first `:`). One hard constraint shapes everything: **the SAM→ESP buffer (`NETBUFF_SIZE`) is 512 bytes total**, so array-valued metrics travel as packed dash-separated strings, not as many ids.

**Numeric id map (what the device sends):**

| id | meaning | emitted by | notes |
|---|---|---|---|
| 53 | Noise dBA (single snapshot) | stock firmware only | disabled on Flavor ≥1 (replaced by accumulators) |
| 55 / 56 / 58 | temperature / humidity / pressure (kPa) | stock sensors | pressure converted kPa→Pa server-side |
| 10 / 14 / 220 / 221 | battery / light / RSSI / SD card | stock sensors | |
| 193–202 | SEN5X particulate (PM/PN/size) | stock sensors | appear every N intervals (sparse payload) |
| 214–216 | UVA / UVB / UVC | stock sensors | |
| 235 | `payload_version` (currently **2**) | Flavor 1+ | lets the parser evolve |
| 236 | `energy_sum` — A-weighted per-frame energy summed over the interval (int64, device scale) | Flavor 1+ | server computes LAeq from this |
| 237 | `frame_count` — frames accumulated | Flavor 1+ | denominator for LAeq and duty |
| 238 | `interval_s` — accumulation window | Flavor 1+ | |
| 239 / 240 | max / min per-frame energy | Flavor 1+ | → Lmax/Lmin estimates |
| 241 | level histogram, packed `"c0-c1-...-c29"` — 30 × 2dB bins covering 30–90 device-dB | Flavor 2+ | → L10/L50/L90 server-side |
| 242 | band energies as dB×10, packed 21 values | Flavor 2+ | LOW (~86–258Hz) + 20 third-octaves (250Hz–20kHz); 86Hz FFT bins can't resolve lower bands |

The device is **integer-only per frame** (fixed-point FFT power path); the only float math on-device is one `log10` per band per interval at packing time. All level/statistics math is server-side — that keeps rollups lossless (energies are additive; dB values are not).

## 4. Database schema (Prisma, migrations 0001–0006)

**`sensors`** — device registry & metadata: `id` (uuid), `device_id` (unique; = MQTT token), `name`, `latitude/longitude/address`, `firmware_version`, `target_firmware_version` (OTA intent), `reading_interval_s`, `is_active`, `last_seen_at`, `created_at`.

**`readings`** — one row per device per interval, wide + nullable (older firmware simply leaves newer columns null):

| group | columns | populated by |
|---|---|---|
| identity/time | `id`, `sensor_id`, `recorded_at` (device clock — when the sound happened), `received_at` (server insert time — distinguishes store-and-forward replays from live data) | ingester |
| stock environment | `noise_dba`, `temperature`, `humidity`, `light_lux`, `pressure_pa`, `uv_a/b/c`, `pm1/25/4/10`, `pn_05/10/25/40/100`, `tps`, `battery`, `rssi`, `sd_card` | parsed 1:1 from stock ids — units, cadence and validated ranges in §4.1 |
| Flavor 1 raw accumulators | `payload_version`, `energy_sum`, `frame_count`, `interval_s`, `max_energy`, `min_energy` | device (verbatim) |
| Flavor 1 computed | `laeq` = 10·log₁₀(energy_sum/frame_count) + calib offset (placeholder 0), `realized_duty` = frame_count/(86.13·interval_s), `lmax_est`, `lmin_est` | ingester (`flavor1.ts`) |
| Flavor 2 spectrum | `hist_raw`, `bands_raw` (packed strings kept verbatim for reprocessing), `l10/l50/l90` (exceedance levels from the histogram, interpolated), `bands_db` (JSONB, 21 dB values) | ingester (`flavor2.ts`) |

Index: `(sensor_id, recorded_at DESC)`. Levels are **device-dB (uncalibrated)** until Flavor 3 (calibration vs a reference meter) sets the real offset.

### 4.1 Environmental measurements — units, cadence, validated ranges

The device is not noise-only: it carries the full SmartCitizen sensor suite, and every
one of those values lands in the same row as the acoustic data. Ranges below are from a
**19h44m continuous run** (`bench2`, 2082 rows, 2026-08-01 13:55 → 08-02 09:39) and are
what "correct" looks like for an indoor unit.

| id | column | unit | cadence | observed range | notes |
|---|---|---|---|---|---|
| 55 | `temperature` | °C | every interval | 29.1 – 33.2 | reads slightly high: board self-heating |
| 56 | `humidity` | % RH | every interval | 37.1 – 41.9 | |
| 58 | `pressure_pa` | **Pa** | every interval | 100150 – 100350 | device sends **kPa**; ingester ×1000 |
| 14 | `light_lux` | lux | every **3rd** interval (~90 s) | 0 – 844 | full diurnal swing — a stuck value is the failure to watch for |
| 10 | `battery` | % | every interval | 96 – 99 | voltage→lookup table, **not** coulomb counting; see the battery caveat below |
| 220 | `rssi` | dBm | every interval | −63 – −51 | |
| 221 | `sd_card` | 0/1 | every interval | 1 | card present |
| 214–216 | `uv_a/b/c` | µW/cm² | every interval | ~0.15 indoors | near zero without direct sun |
| 193–202 | `pm1/25/4/10`, `pn_05/10/25/40/100`, `tps` | µg/m³, #/0.1 L, µm | configured every **5th** interval (~150 s) | PM2.5 3.2 – 9.1 | ⚠️ **observed in only ~10 % of rows, half the configured rate** |
| 53 | `noise_dba` | dB | — | always null | stock one-shot snapshot, **deliberately disabled** on Flavor ≥1 |

**Two structural caveats worth knowing before trusting these:**

1. **They are single instantaneous samples, not aggregates.** Only the noise path
   accumulates across the interval. Every environmental value is one ~1 ms reading
   presented as the value for the whole interval — architecturally the same thing the
   stock noise measurement did before Flavor 1 replaced it. That is fine for slow-moving
   quantities (temperature, humidity, pressure) but understates episodic ones
   (light, particulates, UV), where peaks are missed entirely.
2. **There is no per-sensor failure reporting.** The acoustic path reports
   `realized_duty` and `capFails`, so you know how much of the sound it actually heard.
   Nothing equivalent exists for the other sensors: a read that silently fails is
   indistinguishable from one that never was scheduled. The particulate shortfall above
   was only detectable by counting nulls in the database — which is exactly the blind
   spot that argues for a per-sensor read-failure counter.

`battery` deserves its own warning: `battery.present` is inferred from the charger IC's
"VBAT below system minimum" bit and `percent()` is a voltage→table lookup, so an absent,
flat or disconnected cell can all report a high percentage while on USB power. Treat it
as an indicator, not a measurement.

## 5. Measurement architecture — why the accumulator design

Stock firmware measured one 11.6ms FFT snapshot per interval (~0.02% of the sound). The current design runs the FFT **continuously**, accumulating energy across the whole interval, and reports how much sound it actually analyzed (`realized_duty`). Validation status from the bench (2.5h soak + 4h baseline):

- **LAeq is stable and internally consistent** — two independent computation paths agree: corr(LAeq from energy, L50 from histogram) = **0.987**; Lmax ≥ LAeq ≥ Lmin with 0 ordering violations.
- **Sampling is unbiased** — corr(LAeq, duty) ≈ **0.02** (~0.1dB effect across the observed 6–36% duty range), so partial duty doesn't skew levels. This was the key trust gate and it passed.
- **Duty today:** ~38–40% on clean intervals, ~20% average (publish exchanges interrupt accumulation). Compute ceiling on this chip is ~62–67% (FFT takes ~16.2ms vs 11.6ms of audio). Two implemented-but-unmeasured levers (Flavor 3): yield-during-publish (recovers the average) and frame-sized DMA double-buffering (raises the ceiling).
- **Spectrum is ~free:** histogram + 21 bands cost ~2% duty.

## 6. Where the code is (branch map)

| repo | branch | state |
|---|---|---|
| firmware | `baseline/stock-2026-07` tag / `baseline/experiments` | pinned stock base all flavors branch from |
| firmware | `flavor-1-laeq` → `flavor-2-spectrum` | **validated end-to-end** (LAeq + spectrum, soak-tested) |
| firmware | `flavor-3-duty` | duty levers + ESP debug channel, code-complete, **unmeasured** (see §7) |
| umbrella | `feat/soundwatch-step-1` | stock-payload ingester bridge + received_at + Timescale image (Steps 0–3) |
| umbrella | `flavor-1-laeq` → `flavor-2-spectrum` | ingester compute + migrations 0005/0006, 28 tests green |
| umbrella | `main` | what prod currently runs — pre-rebuild iteration, cutover staged & gated |

## 7. Known issues / open items

- **Bench hardware (2026-07-30):** unit 1 has a failed micro-USB (electrical); unit 2 is wedged by a Flavor-3 boot bug (DMA buffer allocated at static-init starved the 32KB heap — fix is built, needs a bootloader-mode reflash via the RST double-tap). Neither affects the validated Flavor 1/2 stack.
- **WiFi association reliability** (ESP8266): error reporting is coarse (any association failure reports as "wrong password"); an ESP→SAM debug channel was added on `flavor-3-duty` to diagnose properly. Operationally: 2.4GHz WPA2 on channels 1–11 required; `pubint < 60s` keeps the ESP always-on; `power -sleep 0` mandatory for continuous monitoring.
- **Not yet built:** calibration (device-dB → real dB SPL; needs a reference meter), Timescale hypertables/rollups/retention (Step 6), automated DB backups, device-silence alerting.
- **Done since this was written (2026-08-02):** prod cutover, broker per-device ACL, ESP-side OTA, device health telemetry (id 243) and hardware identity stored, `sc-poller` removed. Deployment detail lives in `infrastructure.md`.

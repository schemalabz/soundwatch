# Soundwatch Firmware — Design Spec

## Overview

Minimal fork of [fablabbcn/smartcitizen-kit-2x](https://github.com/fablabbcn/smartcitizen-kit-2x) adding Soundwatch-specific features to the ESP8266 WiFi firmware. The SAMD21 sensor firmware stays untouched. All changes live in a `soundwatch/` subdirectory within the ESP8266 source tree for clean separation from upstream.

**Goal:** A sensor running this firmware publishes to both Smart Citizen and Soundwatch infrastructure independently. When deployed with an SD card config file, it's plug-and-play into the existing Soundwatch platform — data flows from sensor to MQTT broker to ingester to PostgreSQL with no manual steps.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repository | Separate repo (`schema-labs/soundwatch-firmware`), forked from upstream | Independent CI, clean upstream tracking, potential upstream contribution |
| Scope | ESP8266 firmware only | SAMD21 already computes dBA and feeds data to ESP8266; no reason to touch it |
| MQTT connections | Two persistent, independent connections | ESP8266 can handle both (~2-3KB extra RAM); independence means one broker down doesn't affect the other |
| OTA trigger | Periodic (every 24h) + MQTT-triggered instant | Sensors run 24/7 (no reboot), periodic is a safety net, MQTT trigger for fast rollouts |
| SD card buffering | Append JSONL, throttled replay on reconnect | Simple, sufficient capacity, no cap needed |
| Authentication | Per-device username/password on Mosquitto | Right balance of security and provisioning simplicity |
| Provisioning | `soundwatch.json` config file on SD card | One firmware binary for all sensors; device identity on SD card |
| Future: SAMD21 OTA | Documented as future work | ESP8266 can flash SAMD21 via bridge mode; higher risk, needs staged rollout |

## Repository & Build Setup

**Repo:** `schema-labs/soundwatch-firmware`, forked from `fablabbcn/smartcitizen-kit-2x`.

**Scope:** Only the ESP8266 firmware (`esp/` directory). All additions in a `soundwatch/` subdirectory.

**New files:**

```
esp/
├── src/
│   └── soundwatch/
│       ├── SoundwatchManager.h/.cpp    — orchestrates all Soundwatch features
│       ├── SoundwatchMQTT.h/.cpp       — second MQTT connection to our broker
│       ├── SoundwatchConfig.h/.cpp     — reads soundwatch.json from SD card
│       ├── SoundwatchOTA.h/.cpp        — HTTP OTA check + flash
│       └── SoundwatchBuffer.h/.cpp     — SD card JSON replay buffer
```

**Build:** PlatformIO, same as stock. Our code hooks into the existing main loop via `SoundwatchManager.update()`. One build target, one binary for all sensors.

**CI:** GitHub Actions — PlatformIO build on push/PR. Tagged releases publish the firmware binary to GitHub Releases.

## SD Card Configuration

On boot, the firmware reads `/soundwatch.json` from the SD card:

```json
{
  "device_id": "sck-store-042",
  "mqtt": {
    "broker": "mqtt.soundwatch.gr",
    "port": 8883,
    "username": "sck-store-042",
    "password": "generated-secret-here"
  },
  "reading_interval_s": 60,
  "ota": {
    "url": "https://soundwatch.gr/api/firmware/latest",
    "check_interval_s": 86400
  }
}
```

**Behavior:**

- If the file is missing or malformed, Soundwatch features are disabled — the sensor operates as a stock SCK.
- Config values are held in RAM after boot.
- `reading_interval_s` can be overridden at runtime via MQTT config commands, but the override doesn't persist to SD — a reboot reverts to the file value.
- `device_id` is used in MQTT topics and payloads. It must match the sensor's record in the Soundwatch database.

## Dual MQTT Connections

### Stock Connection (untouched)

The existing `MqttController` publishes to `mqtt.smartcitizen.me` using the SCK's native format and per-device token. No modifications.

### Soundwatch Connection

`SoundwatchMQTT` manages a second, independent MQTT client connecting to our Mosquitto broker over TLS (port 8883). Credentials from `soundwatch.json`.

**Topics published by the sensor:**

```
soundwatch/sensors/{device_id}/readings   — sensor data, every reading_interval_s
soundwatch/sensors/{device_id}/status     — "online" on connect, "offline" as LWT
```

**Topics subscribed by the sensor:**

```
soundwatch/sensors/{device_id}/config     — remote configuration commands
```

### Readings Payload

```json
{
  "device_id": "sck-store-042",
  "firmware_version": "1.0.0",
  "recorded_at": "2026-06-15T14:30:00Z",
  "sensors": [
    {"id": "noise_dba", "value": 68.3},
    {"id": "temperature", "value": 27.1},
    {"id": "humidity", "value": 54.2},
    {"id": "light_lux", "value": 340.0},
    {"id": "pressure_pa", "value": 101325.0},
    {"id": "uv_index", "value": 3.2},
    {"id": "pm1", "value": 8.1},
    {"id": "pm25", "value": 12.4},
    {"id": "pm4", "value": 15.0},
    {"id": "pm10", "value": 18.7}
  ]
}
```

This matches the existing ingester's expected format (`mqtt-ingester/parser.ts`). The `firmware_version` field is a new addition — the ingester currently ignores unknown fields, so it's non-breaking. A minor ingester update is needed to extract it and update `sensors.firmware_version`.

### Status / LWT

- On connect: publishes `{"status": "online", "device_id": "sck-store-042"}` to the status topic.
- LWT (Last Will and Testament): `{"status": "offline", "device_id": "sck-store-042"}` — published automatically by the broker if the sensor disconnects unexpectedly.

### Independence

The two MQTT connections share no state. If one broker is unreachable, the other continues publishing. Connection retries use exponential backoff (1s, 2s, 4s, ... capped at 60s).

## Remote Configuration via MQTT

The sensor subscribes to `soundwatch/sensors/{device_id}/config` on connect. The admin dashboard already publishes to this topic via `POST /api/admin/sensors/:id/config`.

### Config Command Format

```json
{
  "command": "update_config",
  "reading_interval_s": 30
}
```

```json
{
  "command": "check_update"
}
```

### Supported Commands

| Command | Fields | Behavior |
|---------|--------|----------|
| `update_config` | `reading_interval_s` | Relays interval change to SAMD21 via the existing serial command protocol (the stock SCK already supports this). Also updates the local value in ESP8266 RAM. Does not persist to SD — reboot reverts to `soundwatch.json` value. |
| `check_update` | — | Triggers an immediate OTA check against the firmware server. |

**Behavior:**

- Unknown commands are ignored (forward-compatible).
- Malformed JSON is logged and ignored.
- No acknowledgment published back for v1. Admin dashboard infers success from subsequent readings.

## OTA Updates

### Firmware-Side Flow

1. Every 24 hours (configurable via `soundwatch.json`), or immediately on `check_update` MQTT command, the sensor makes an HTTP GET to the OTA URL.
2. Request includes header: `X-Firmware-Version: 1.0.0` (current version).
3. If server responds `200` with a binary: download, verify SHA-256 checksum against `X-Firmware-Checksum` header, flash via standard ESP8266 OTA (`ESP.flashWrite`).
4. If server responds `304 Not Modified`: no update needed.
5. On successful flash, the ESP8266 reboots automatically.
6. On failure (download error, checksum mismatch): log error, retry at next scheduled check.

### Server-Side Contract (`GET /api/firmware/latest`)

**Request:**

| Header | Purpose |
|---|---|
| `X-Firmware-Version` | Current version running on sensor |

**Response:**

| Response | Meaning |
|---|---|
| `200` + binary body | New firmware. Headers: `X-Firmware-Version: 1.1.0`, `Content-Length`, `X-Firmware-Checksum: sha256:abc...` |
| `304 Not Modified` | Sensor already on latest version |

**Binary source:** CI builds on tagged releases push firmware binaries to GitHub Releases. The `/api/firmware/latest` endpoint proxies or redirects to the release binary.

### Scope

ESP8266 OTA only. SAMD21 OTA via the ESP8266-SAMD21 bridge is planned as future work — it requires checksum verification, staged rollout, and physical USB recovery fallback for failed flashes.

## SD Card Replay Buffer

### When It Activates

Only when the Soundwatch MQTT connection is down. The Smart Citizen connection and its stock CSV writing are completely unaffected.

### Write Path

When a reading is due and our broker is unreachable, append the JSON reading to `/soundwatch_buffer.jsonl` on the SD card. JSONL format — one complete JSON object per line, no array wrapper.

### Replay Path

1. On reconnect to our broker, `SoundwatchBuffer` reads the file line by line.
2. Publishes each buffered reading at a throttled rate of 10 messages/second.
3. After all messages are published successfully, deletes the file.
4. If replay is interrupted (connection drops mid-replay), stops and resumes from where it left off on next reconnect.

### Capacity

At 60-second intervals, 24 hours offline = 1,440 readings at ~300 bytes each = ~430KB. Even a week offline is under 3MB. No cap needed.

### Isolation from Stock CSV

The stock firmware writes CSV files to its own data directory. Our buffer is a separate file (`/soundwatch_buffer.jsonl`). They don't interfere.

## Integration Points

This is the interface contract between the firmware and the Soundwatch platform.

| Interface | Firmware Side | Platform Side |
|---|---|---|
| **Readings** | Publishes to `soundwatch/sensors/{device_id}/readings` | Ingester subscribes to `soundwatch/sensors/+/readings`, parses, inserts into DB |
| **Status** | Publishes `online` on connect, sets `offline` as LWT on status topic | Ingester can subscribe to `soundwatch/sensors/+/status` to update `sensors.last_seen_at` |
| **Config** | Subscribes to `soundwatch/sensors/{device_id}/config` | Admin endpoint `POST /api/admin/sensors/:id/config` already publishes here |
| **OTA** | `GET /api/firmware/latest` with `X-Firmware-Version` header | Endpoint returns `200` + binary or `304`. Needs to be implemented. |
| **Provisioning** | Reads `soundwatch.json` from SD card | Manual for v1. Admin dashboard could generate config files in the future. |
| **Auth** | Per-device username/password from `soundwatch.json` | Mosquitto password file with matching credentials |

### Platform Changes Needed for v1

1. **Ingester:** Extract `firmware_version` from reading payloads, update `sensors.firmware_version` on upsert. Minor change to `parser.ts` and upsert logic.
2. **New endpoint:** `GET /api/firmware/latest` — serves latest firmware binary with version and checksum headers. Can proxy from GitHub Releases.

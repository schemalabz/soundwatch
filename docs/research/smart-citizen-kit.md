# Smart Citizen Kit — Research Notes

Research conducted during the initial architecture brainstorming session.

## Hardware (SCK 2.3 — latest)

- **Main MCU**: SAMD21 (handles sensors, main firmware logic)
- **WiFi MCU**: ESP8266 (handles connectivity)
- **Noise sensor**: Invensense ICS-43432 MEMS microphone (outputs dBA)
- **Other sensors**: Sensirion SHT-31 (temp/humidity), Rohm BH1721FVC (light), NXP MPL3115A26S (pressure), AMS AS7331 (UV), Sensirion SEN5X (PM1/PM2.5/PM4/PM10)
- **Power**: always needs battery connected, USB for charging
- **Storage**: micro SD card for offline data (CSV format)
- **Firmware language**: C++ (PlatformIO)
- **Codebase**: https://github.com/fablabbcn/smartcitizen-kit-2x (1,878 commits, C++ 55.9%, C 27.1%)

## Firmware Architecture

- Two processors on the Data Board: SAMD21 (main) + ESP8266 (WiFi)
- SAMD21 firmware handles sensor reading, processing, and data flow
- ESP8266 firmware handles WiFi connectivity and MQTT publishing
- Due to SAMD21 flash limitations, firmware is split into different build files for different sensor configurations (Air, Water variants)
- Built with PlatformIO

## How Data Flows (stock firmware)

1. SAMD21 reads sensors, computes dB locally (edge processing)
2. ESP8266 publishes via MQTT to `mqtt.smartcitizen.me`
3. Each device authenticates with a unique secret token
4. Data also stored to SD card in CSV format

## OTA Updates

**The stock SCK does NOT support OTA updates.** Updates are USB-only:
- SAMD21: double-click reset → drag firmware file to USB drive that appears
- ESP8266: uploaded through SAMD21 via a bridge mode
- CLI option: `python make.py flash sam -v --env sck23_air` for batch flashing

The ESP8266 chip supports OTA at the hardware level (standard Arduino/ESP feature), but the SCK firmware doesn't implement it. Our fork needs to add this.

## Smart Citizen Platform Stack

| Component | Tech | Repo |
|-----------|------|------|
| API | Ruby on Rails, PostgreSQL + Cassandra/KairosDB, Redis, MQTT (EMQ), Sidekiq | `fablabbcn/smartcitizen-api` |
| Web frontend | AngularJS (legacy), Gulp/Bower | `fablabbcn/smartcitizen-web` |
| Firmware | C++ on SAMD21 + ESP8266 | `fablabbcn/smartcitizen-kit-2x` |

## Smart Citizen API

- Base URL: `https://api.smartcitizen.me/v0/`
- Auth: OAuth 2.0 or per-device token (MQTT)
- Devices post via MQTT (primary) or HTTP REST (batch uploads)
- WebSockets currently disabled
- MQTT forwarding available for researcher accounts

### Key API Endpoints

- `GET /v0/devices` — list all devices
- `GET /v0/devices/:id` — device with latest readings
- `GET /v0/devices/:device_id/readings` — historical readings with rollup/aggregation
- `GET /v0/devices/world_map` — summary for map visualization
- `POST /v0/devices/:device_id/readings` — submit readings

### Data Posting Format (to Smart Citizen)

```json
{
  "data": [{
    "recorded_at": "2016-06-08 10:30:00",
    "sensors": [
      { "id": 22, "value": 21 }
    ]
  }]
}
```

Sensors are identified by numeric ID or string hash.

### Rate Limits

- Citizen role: 90 req/min
- Researcher role: unlimited

## Our Firmware Changes (planned)

Per the architecture spec, our fork adds:

1. **Dual MQTT publish** — publish to both `mqtt.smartcitizen.me` (stock format) and our Mosquitto broker (our format)
2. **Configurable reading interval** — default 60s, adjustable via MQTT command on `soundwatch/sensors/{device_id}/config`
3. **OTA update support** — ESP8266 checks `/api/firmware/latest` on boot and periodically
4. **Resilience** — buffer to SD card if our broker is unreachable

### Our MQTT Topic Structure

```
soundwatch/sensors/{device_id}/readings   — sensor data
soundwatch/sensors/{device_id}/status     — online/offline heartbeat
soundwatch/sensors/{device_id}/config     — remote configuration
```

### Our Payload Format

```json
{
  "device_id": "sck-store-042",
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

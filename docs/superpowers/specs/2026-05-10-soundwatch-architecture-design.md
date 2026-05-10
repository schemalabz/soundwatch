# Soundwatch Athens — Architecture Design

## Overview

Soundwatch Athens is a 12-month pilot to create Athens' first live noise monitoring platform using ~50 Smart Citizen Kit 2.3 sensors deployed at Skroutz physical stores. The platform provides a public, interactive noise map, a leaderboard ranking areas by noise level, and open data access for citizen advocacy.

## System Architecture

```
SCK 2.3 Sensors (x50, at Skroutz stores)
    │
    ├──► Smart Citizen MQTT broker (smartcitizen.me) ── backup/visibility
    │
    └──► Soundwatch Mosquitto broker (self-hosted via Coolify)
              │
              ▼
         MQTT Ingester (Node.js service)
              │
              ▼
         PostgreSQL
              │
              ▼
         Next.js App
         ├── Public API (/api/sensors, /api/sensors/:id/readings)
         ├── Live map (Mapbox GL)
         ├── Leaderboard
         ├── Sensor detail + historical charts
         └── Admin dashboard (protected)
```

### Key Architectural Decisions

- **Dual-publish firmware**: sensors post to both Smart Citizen and our own MQTT broker for independence with backup
- **Single Next.js app**: API routes serve the frontend and public data API; a separate MQTT ingester process handles data ingestion
- **Plain PostgreSQL**: sufficient for 50 sensors at ~2.6M readings/year
- **Mosquitto**: lightweight MQTT broker, trivial to operate at this scale
- **Mapbox GL**: consistent with OpenCouncil project, reuse patterns from `src/lib/geo.ts`
- **Coolify on DigitalOcean**: Docker Compose for production, Nix flake for local dev
- **Fully public platform**: no user auth for viewing; protected admin area
- **Open source**: all software is open source

## Component 1: Firmware (SCK Fork)

Fork of `fablabbcn/smartcitizen-kit-2x`. Changes to the ESP8266 WiFi firmware:

### Dual MQTT Publish

Connect to both `mqtt.smartcitizen.me` (existing format) and our Mosquitto broker. Independent connections — if one broker is down, the other continues.

### Configurable Reading Interval

Default 60s. Adjustable via MQTT command on the config topic. Sensor subscribes to its config topic on boot.

### OTA Update Support

On boot and periodically, check our firmware server for new versions (`GET /api/firmware/latest`). Download and flash if available. Standard ESP8266 OTA flow.

### Resilience

If our broker is unreachable, buffer readings to SD card and retry. Smart Citizen publish continues independently.

### MQTT Topic Structure

```
soundwatch/sensors/{device_id}/readings   -- sensor data
soundwatch/sensors/{device_id}/status     -- online/offline heartbeat
soundwatch/sensors/{device_id}/config     -- remote configuration
```

### Reading Payload

All available SCK 2.3 sensor data is captured:

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

Noise is the primary metric for the platform UX, but all readings are stored for potential future features (air quality overlays, heat maps, etc.).

## Component 2: Database

### Schema

```sql
CREATE TABLE sensors (
  id                  UUID PRIMARY KEY,
  device_id           TEXT UNIQUE NOT NULL,
  name                TEXT,
  latitude            FLOAT,
  longitude           FLOAT,
  address             TEXT,
  firmware_version    TEXT,
  reading_interval_s  INT DEFAULT 60,
  is_active           BOOLEAN DEFAULT true,
  last_seen_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE readings (
  id                  BIGSERIAL PRIMARY KEY,
  sensor_id           UUID REFERENCES sensors(id) NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL,
  noise_dba           REAL,
  temperature         REAL,
  humidity            REAL,
  light_lux           REAL,
  pressure_pa         REAL,
  uv_index            REAL,
  pm1                 REAL,
  pm25                REAL,
  pm4                 REAL,
  pm10                REAL
);

CREATE INDEX idx_readings_sensor_time ON readings (sensor_id, recorded_at DESC);
```

Two tables. Aggregations for leaderboard and charts computed from raw readings at query time for v1. Precomputed aggregates can be added later if performance requires it.

## Component 3: Backend

### MQTT Ingester

A standalone Node.js/TypeScript process (`mqtt-ingester.ts`) that:

- Subscribes to `soundwatch/sensors/+/readings` on Mosquitto
- Parses and validates incoming readings
- Inserts into PostgreSQL `readings` table
- Updates `sensors.last_seen_at` on each reading
- Runs as its own service in the Docker Compose stack

### API Routes (Next.js `/app/api/`)

**Public:**

```
GET /api/sensors              -- all sensors with latest reading
GET /api/sensors/:id          -- single sensor with details
GET /api/sensors/:id/readings -- historical readings (params: from, to)
```

**Admin (protected via env-based token):**

```
GET  /api/admin/sensors            -- all sensors with health status
POST /api/admin/sensors            -- register new sensor
PATCH /api/admin/sensors/:id       -- update sensor metadata
POST /api/admin/sensors/:id/config -- push config change via MQTT
```

**Firmware:**

```
GET /api/firmware/latest      -- latest firmware binary for OTA
```

The public API doubles as the open data interface. No separate export mechanism needed for v1.

### Admin Authentication

Environment variable with an admin token, checked via middleware on `/api/admin/*` routes. Sufficient for a small team managing 50 sensors.

## Component 4: Frontend

### Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Mapbox GL (following OpenCouncil patterns)
- Chart.js or recharts for time-series charts

### Pages

```
/                    -- Map page (main view)
/sensors/:id         -- Sensor detail page
/leaderboard         -- Ranked list of sensors
/about               -- About the project, open data info
/admin               -- Admin dashboard (protected)
```

### Map Page (`/`)

- Full-screen Mapbox GL map centered on Athens
- Markers for each sensor, color-coded by current noise level:
  - Green: <55 dB (quiet)
  - Yellow: 55-65 dB (moderate)
  - Orange: 65-75 dB (loud)
  - Red: >75 dB (very loud)
- Click marker → popup with sensor name, current dB, link to detail page
- Sidebar or overlay with leaderboard as engagement hook

### Sensor Detail (`/sensors/:id`)

- Current readings (all metrics, noise prominent)
- Historical chart (noise dB over 24h/7d/30d)
- Sensor location on small map
- Metadata (address, store name, last update)

### Leaderboard (`/leaderboard`)

- Ranked list by current/average noise level
- Toggle: noisiest vs quietest
- Table with sensor name, location, dB value, trend indicator

### Admin (`/admin`)

- Sensor health overview (online/offline, last seen)
- Register/edit sensors
- Push config changes (reading interval)

### Data Fetching

- Server components for initial page loads
- Client-side polling or SSE for live map updates

## Component 5: Infrastructure & Deployment

### Production (Coolify on DigitalOcean)

```yaml
# docker-compose.yml
services:
  app:              # Next.js frontend + API
  mqtt-ingester:    # MQTT subscription → PostgreSQL
  mosquitto:        # MQTT broker (port 8883 MQTTS for sensors)
  postgres:         # Database
```

- Single DO droplet running Coolify
- Coolify manages Docker Compose stack, SSL certs, Git-push deploys
- Mosquitto exposed on port 8883 (MQTTS) for sensor connections

### Local Development (Nix Flake)

`flake.nix` provides Node.js, and developers run `nix develop` for the full dev environment. Local PostgreSQL and Mosquitto can run via Docker Compose or Nix services.

### Firmware Builds

- PlatformIO for building/flashing the SCK firmware fork
- CI builds firmware binaries on push
- Binaries served from the app via `/api/firmware/latest` for OTA

### CI/CD

- GitHub Actions: lint, typecheck, test on PR
- Coolify auto-deploys main branch on push

### Monitoring (v1 — lightweight)

- Admin dashboard shows sensor last-seen timestamps, flags offline sensors (>5 min)
- Coolify built-in monitoring + healthcheck endpoint
- No external monitoring stack for v1

## Project Structure

```
soundwatch/
├── flake.nix                    # Nix dev environment
├── docker-compose.yml           # Production services
├── package.json
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # Map page
│   │   ├── sensors/[id]/
│   │   ├── leaderboard/
│   │   ├── about/
│   │   ├── admin/
│   │   └── api/
│   │       ├── sensors/
│   │       ├── admin/
│   │       └── firmware/
│   ├── components/
│   │   ├── map/                 # Map components (Mapbox GL)
│   │   ├── leaderboard/
│   │   ├── sensors/
│   │   └── admin/
│   ├── lib/
│   │   ├── db.ts                # PostgreSQL client
│   │   ├── geo.ts               # Geo utilities (from OpenCouncil patterns)
│   │   └── mqtt.ts              # MQTT client utilities
│   └── types/
├── mqtt-ingester/
│   └── index.ts                 # Standalone MQTT → PostgreSQL service
├── firmware/                    # SCK fork (git submodule or separate repo)
├── docs/
│   └── superpowers/
│       └── specs/
└── prisma/ or drizzle/          # DB schema & migrations
```

## Out of Scope for v1

- User accounts and authentication (beyond admin)
- Push notifications or alerts
- Precomputed aggregation tables
- Database partitioning
- External monitoring stack (Grafana, etc.)
- Mobile app
- Embeddable widgets
- CSV/bulk data export endpoints

# Soundwatch Athens — Production Readiness Design

## Overview

Platform changes needed before connecting real sensors. Covers MQTT security, deployment automation, firmware integration, admin editing, and connection verification. Aligns with the firmware spec at `docs/superpowers/specs/2026-05-22-soundwatch-firmware-design.md`.

## 1. MQTT Authentication & TLS

Mosquitto runs two listeners:

**Port 1883 (internal):** Ingester and admin API connect here within the Docker network. Anonymous access, not exposed to the internet.

**Port 8883 (external):** Sensors connect from the internet. Requires username/password + TLS.

### Mosquitto Config

```
# Internal listener — Docker network only
listener 1883
allow_anonymous true

# External listener — sensors connect here
listener 8883
allow_anonymous false
password_file /mosquitto/config/passwd
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
```

### Password Management

Mosquitto passwd file with per-device credentials. For v1, generated manually when provisioning sensors:

```bash
mosquitto_passwd -b /path/to/passwd sck-store-042 generated-secret
```

Same credentials go into the sensor's `soundwatch.json` SD card file. The passwd file is mounted as a Docker volume.

### TLS Certificates

Separate Let's Encrypt cert for the MQTT subdomain (`mqtt.soundwatch.gr`) via certbot on the droplet, or use Coolify's wildcard cert if available. Certs mounted into the Mosquitto container as a volume.

DNS: Add A record for `mqtt.soundwatch.gr` pointing to the same droplet IP.

## 2. Ingester Updates

### a) Firmware Version Extraction

Add `firmwareVersion` (optional string) to `ParsedReading`. Extract from `firmware_version` field in reading payloads. Update `sensors.firmware_version` on upsert.

Backwards-compatible: payloads without `firmware_version` (e.g., from the simulator) continue to work — the field is undefined and the upsert skips it.

### b) Status/LWT Handling

Subscribe to `soundwatch/sensors/+/status` in addition to readings. On `{"status": "online"}` messages, update `sensors.last_seen_at`. LWT `{"status": "offline"}` messages are logged but don't need storage — `last_seen_at` staleness already indicates offline sensors.

### c) No Auth Change for Ingester

The ingester connects to the internal listener (port 1883, anonymous). No code change needed for auth.

## 3. OTA Firmware Endpoint

`GET /api/firmware/latest` — serves firmware binaries for sensor OTA updates.

### Request Headers

| Header | Purpose |
|--------|---------|
| `X-Firmware-Version` | Current version running on sensor |
| `X-Device-Id` | Sensor's device_id for per-device targeting |

### Response

| Response | Meaning |
|----------|---------|
| `200` + redirect to binary | New firmware available |
| `304 Not Modified` | Sensor already on target version |
| `404` | No firmware binary found |

### Per-Device Targeting

New nullable field `target_firmware_version` on the `sensors` table.

- If `targetFirmwareVersion` is null → serve the latest GitHub Release (default)
- If `targetFirmwareVersion` is set → serve that specific release tag
- If sensor is already on the target version → `304`

This allows testing new firmware on individual sensors before rolling out to the fleet.

### GitHub Integration

Fetches releases from `schema-labs/soundwatch-firmware` via GitHub API. Cached for 5 minutes. Optional `GITHUB_TOKEN` env var to avoid rate limits.

## 4. Auto Migrations on Deploy

Replace the app container's `CMD` with a startup script:

```sh
#!/bin/sh
npx prisma migrate deploy
exec node server.js
```

`prisma migrate deploy` is idempotent — if the database is already up to date, it's a no-op (<1s). Every deploy automatically applies pending migrations.

## 5. Admin Dashboard — Sensor Editing

Add edit capability to the admin dashboard. Currently read-only.

### Editable Fields

- Name
- Address
- Latitude / Longitude
- Reading interval (pushes config via MQTT)
- Target firmware version (for OTA targeting)
- Active toggle

### UX

Click a sensor row → edit form (slide-out panel or inline). Save calls `PATCH /api/admin/sensors/:id`. Reading interval changes also call `POST /api/admin/sensors/:id/config` to push via MQTT.

## 6. Database Backups

Configure via Coolify dashboard — not code. Daily backups to the droplet's disk. Optionally configure DO Spaces for off-server backup.

## 7. Connection Test Script

`scripts/test-connection.ts` — verifies the full chain works before enabling real sensors.

```bash
npm run test:connection -- --broker mqtt.soundwatch.gr --port 8883 \
  --username sck-test-001 --password test-secret --device-id sck-test-001
```

### What It Tests

1. TLS connection to Mosquitto on port 8883
2. Authentication with provided credentials
3. Publishes a test reading (firmware payload format with `firmware_version` and `device_id`)
4. Waits, then queries `GET /api/sensors` to verify the reading was ingested into PostgreSQL

Prints "All checks passed" or identifies the exact failure point.

## Schema Migration

Add to `sensors` table:

```sql
ALTER TABLE sensors ADD COLUMN target_firmware_version TEXT;
```

## Docker Compose Changes

### Mosquitto

Update `Dockerfile.mosquitto` and `docker-compose.yml` to:
- Copy passwd file into image (or mount as volume)
- Mount TLS certificates
- Expose port 8883

### App

Update `Dockerfile` to use startup script that runs migrations before starting.

### Environment Variables

Add to `.env.production.example`:

```
GITHUB_TOKEN=                    # Optional, for GitHub API rate limits on OTA endpoint
```

## Out of Scope

- Automatic passwd file management (v1 is manual)
- MQTT ACLs (per-device topic restrictions)
- Sensor provisioning UI (generating soundwatch.json files)
- Database backup configuration (Coolify dashboard, not code)

# Deploying the dashboard to production

The merge of `merge/main-firmware-1.1` into `main` is not an ordinary deploy. It
runs migration 0016, which converts `readings` into a hypertable — a table
rewrite, an index swap and a data move, on the only copy of 142,450 real
measurements going back to 2026-05-23.

This is the order that was rehearsed. Companion: `infrastructure.md` (what runs
where), `architecture-current.md` (system overview).

## What makes this deploy different

| | |
|---|---|
| Migrations pending | 0016 (hypertable), 0017 (received_at index) |
| Rows at risk | 142,450 readings · 24 sensors · 296 MB |
| Irreversible | `readings.id` is dropped. Nothing references it, no code reads it, and it cannot come back without a restore |
| Rehearsed | 2026-08-14, against a restore of that morning's dump |

Rehearsal result, isolated container, real production data:

```
migrate deploy 0015 -> 0017     10 s
hypertable chunks created        9
readings before / after          138,270 / 138,270
timescale-objects.ts              1 s, 19,802 aggregate rows
every dashboard API route        200
```

## Preconditions

**1. The droplet has headroom.** Before the resize it ran 655 MB available of
1967, with 795 MB of swap already in use, and the pressure point is Next.js
builds — of which this deploy has two if staging goes up alongside. Resize
first.

**2. A backup exists from today, and you have fetched it.** `/root/db-backup.sh`
runs nightly at 03:15 UTC into `/root/db-backups/`, 14-day rotation. Dumps live
on the droplet only, which means a droplet failure loses both the database and
its backups. Take a fresh one immediately before merging and pull it down:

```bash
ssh root@188.166.164.198 '/root/db-backup.sh && ls -lh /root/db-backups/ | tail -2'
```

**3. `shared_preload_libraries` is set.** Handled in the compose file as of
`64f4d06` — no manual step. Verify after deploy, not before: it takes effect
when Coolify recreates the postgres container.

## Order

1. **Resize the droplet.** A reboot. Devices buffer to flash and replay on
   reconnect, so no readings are lost — `received_at` will simply run late for
   the units that were mid-interval.

2. **Fresh backup, fetched to a second machine.** See above. This is the only
   step with no undo if skipped.

3. **Merge PR #9 to `main`.** The GitHub webhook triggers Coolify. Postgres is
   recreated with the preload flag, the ingester applies 0016 and 0017, the app
   creates the continuous aggregate on boot (`64f4d06` put the bundled script in
   the app image, so it no longer depends on the ingester winning that race).

4. **Watch the deploy.** Coolify UI at `http://188.166.164.198:8000`, or:

```bash
ssh root@188.166.164.198 'docker logs -f $(docker ps --format "{{.Names}}" | grep "^mqtt-ingester-")'
```

5. **Verify** (below). If it fails, roll back (below).

6. **Bring up staging** as a second Coolify resource: same repo and branch,
   compose file `docker-compose.staging.yml`, domain `staging.soundwatch.gr`
   (needs an A record to the droplet), HTTP basic auth enabled, and an
   `ADMIN_TOKEN` and `POSTGRES_PASSWORD` that are **not** production's.

## Verification

```bash
ssh root@188.166.164.198 '
PG=$(docker ps --format "{{.Names}}" | grep "^postgres-")
docker exec "$PG" psql -U soundwatch -d soundwatch -c "SHOW shared_preload_libraries;"
docker exec "$PG" psql -U soundwatch -d soundwatch -c "
  SELECT (SELECT count(*) FROM readings) AS readings,
         (SELECT count(*) FROM sensors)  AS sensors,
         (SELECT count(*) FROM timescaledb_information.chunks
            WHERE hypertable_name = \"readings\") AS chunks,
         (SELECT count(*) FROM readings_hour_bins) AS rollup_rows;"'
```

Expect: `timescaledb`; readings **at or above** the pre-deploy count (devices
keep writing); 24 sensors; chunks > 0; rollup_rows > 0.

Then, from anywhere:

```bash
for p in sensors freshness status api/docs; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "https://soundwatch.gr/api/${p#api/}"
done
```

**Expect one sensor on the map.** Of the 24 rows, 15 are active and public but
have no location and have not reported in 24 h; 3 are sited but flagged as bench
units and are correctly excluded from public view; 1 — Βαλτινών — is active,
public and sited. That is the network as it stands, not a deployment fault.

**Expect history to start 2026-08-01.** The 14,862 rows from May to July are
stock-firmware readings with no `laeq` at all, so nothing can chart them.

## Rollback

The migration is forward-only. Rolling back means restoring.

```bash
ssh root@188.166.164.198
PG=$(docker ps --format '{{.Names}}' | grep '^postgres-')
docker exec -i "$PG" psql -U soundwatch -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='soundwatch';"
docker exec -i "$PG" pg_restore -U soundwatch -d soundwatch --clean --if-exists \
  --no-owner /root/db-backups/soundwatch-YYYY-MM-DD.dump
```

Then revert `main` to the previous commit and let Coolify redeploy. Readings
that arrived between the backup and the rollback are lost — which is the real
argument for taking the backup immediately before, not relying on 03:15.

## Known gaps

- **Backups never leave the droplet.** A droplet failure loses the database and
  every dump of it. `scripts/prod-backup.sh fetch` exists; nothing runs it on a
  schedule.
- **The frame-log volume is unbounded.** Nothing expires `frame_log_chunks`;
  at fleet scale it grows ~13.6 GB/month.
- **Nothing watches for silent devices.** `last_seen_at` is recorded and unread.

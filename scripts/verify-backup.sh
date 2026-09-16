#!/usr/bin/env bash
# verify-backup.sh — prove the newest dump actually restores.
#
#   scripts/verify-backup.sh              verify the newest dump on the droplet
#   scripts/verify-backup.sh --file <f>   verify a specific dump on the droplet
#   scripts/verify-backup.sh --install    install it on the droplet + nightly cron (04:15)
#
# A dump that has never been restored is not a backup, it is a file. This
# restores it into a DISPOSABLE postgres container and compares the result
# against the live database, then throws the container away.
#
# Why a disposable container and not the live one: restoring into production
# would put a full rewrite of every table next to the database serving the
# site, and TimescaleDB's timescaledb_pre_restore() changes settings for the
# whole database it runs in. Nothing here touches production beyond two
# read-only COUNT queries.
#
# The restore path is the documented one, and the pre/post calls are required:
# pg_dump warns about circular foreign keys on TimescaleDB's continuous_agg
# catalog, and a plain pg_restore leaves the hypertable and the continuous
# aggregate broken. See docs/infrastructure.md.
set -euo pipefail

HOST=${SW_PROD_HOST:-root@188.166.164.198}
KEY=${SW_PROD_SSH_KEY:-$HOME/.ssh/personal_digitalocean}
RESOURCE=${SW_DB_RESOURCE:-soundwatch}

remote() { ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" "$@"; }

# Everything below runs ON the droplet. Kept in one string so `--install` can
# drop the identical logic into /root/verify-backup.sh for cron.
REMOTE_BODY='
set -euo pipefail
RESOURCE="${RESOURCE:?}"
DUMP="${DUMP:-}"
BDIR=/root/db-backups
LOG="$BDIR/verify.log"
SCRATCH=sw-verify-$$

log() { echo "$(date -Is) $*" | tee -a "$LOG"; }
fail() { log "FAIL $*"; cleanup; exit 1; }
cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# The live database, selected the same way the backup selects it.
mapfile -t CIDS < <(docker ps --format "{{.Names}}" \
  --filter "label=coolify.resourceName=$RESOURCE" | grep "^postgres-" || true)
[ "${#CIDS[@]}" -eq 1 ] || fail "expected 1 postgres container for $RESOURCE, found ${#CIDS[@]}"
LIVE="${CIDS[0]}"

[ -n "$DUMP" ] || DUMP="$(ls -1t "$BDIR"/soundwatch-*.dump 2>/dev/null | head -1)"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || fail "no dump found in $BDIR"

# Match the engine the dump came from; "latest" would drift out from under us.
IMAGE="$(docker inspect -f "{{.Config.Image}}" "$LIVE")"
log "verifying $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)) against $RESOURCE using $IMAGE"

docker run -d --name "$SCRATCH" -e POSTGRES_PASSWORD=verify -e POSTGRES_USER=soundwatch \
  -e POSTGRES_DB=postgres "$IMAGE" \
  -c shared_preload_libraries=timescaledb >/dev/null

# Wait over TCP, not the unix socket. During initdb the image runs a TEMPORARY
# server that listens on the socket only; polling that races the real startup
# and the connection dies mid-restore when init tears it down.
for _ in $(seq 1 90); do
  docker exec "$SCRATCH" pg_isready -h 127.0.0.1 -U soundwatch -q && break
  sleep 2
done
docker exec "$SCRATCH" pg_isready -h 127.0.0.1 -U soundwatch -q \
  || fail "scratch postgres never became ready"

docker exec "$SCRATCH" psql -U soundwatch -d postgres -qc "create database restored;" >/dev/null 2>&1
docker exec "$SCRATCH" psql -U soundwatch -d restored -qc "create extension if not exists timescaledb;" >/dev/null 2>&1
docker exec "$SCRATCH" psql -U soundwatch -d restored -qtAc "select timescaledb_pre_restore();" >/dev/null 2>>"$LOG" \
  || fail "timescaledb_pre_restore failed (see $LOG)"
docker cp "$DUMP" "$SCRATCH":/tmp/verify.dump
docker exec "$SCRATCH" pg_restore -U soundwatch -d restored --no-owner /tmp/verify.dump >/dev/null 2>&1 \
  || log "note: pg_restore reported non-fatal errors (checked by the counts below)"
docker exec "$SCRATCH" psql -U soundwatch -d restored -qtAc "select timescaledb_post_restore();" >/dev/null 2>>"$LOG" \
  || fail "timescaledb_post_restore failed (see $LOG)"

q()  { docker exec "$1" psql -U soundwatch -d "$2" -tAc "$3" 2>/dev/null | tr -d " \r"; }
ok=1
report=""
for check in \
  "sensors|select count(*) from sensors" \
  "readings|select count(*) from readings" \
  "hypertables|select count(*) from timescaledb_information.hypertables" \
  "chunks|select count(*) from timescaledb_information.chunks" \
  "continuous_aggregates|select count(*) from timescaledb_information.continuous_aggregates"
do
  name="${check%%|*}"; sql="${check#*|}"
  got="$(q "$SCRATCH" restored "$sql")"
  live="$(q "$LIVE" soundwatch "$sql")"
  [ -n "$got" ] || { ok=0; report="$report $name=MISSING"; continue; }
  # readings legitimately grows between the dump and now; it may not shrink.
  if [ "$name" = "readings" ]; then
    [ "$got" -gt 0 ] && [ "$got" -le "$live" ] || { ok=0; report="$report $name=$got/live=$live"; continue; }
  else
    [ "$got" = "$live" ] || { ok=0; report="$report $name=$got/live=$live"; continue; }
  fi
  report="$report $name=$got"
done

[ "$ok" -eq 1 ] || fail "$(basename "$DUMP")$report"
log "OK $(basename "$DUMP")$report"
'

case "${1:-}" in
  --install)
    remote "RESOURCE='$RESOURCE' bash -s" <<EOF
set -euo pipefail
cat > /root/verify-backup.sh <<'INNER'
#!/usr/bin/env bash
RESOURCE="\${RESOURCE:-$RESOURCE}"
$REMOTE_BODY
INNER
chmod +x /root/verify-backup.sh
# 04:15 — an hour after the 03:15 backup, so it verifies last night's dump.
printf '15 4 * * * root RESOURCE=%s /root/verify-backup.sh >/dev/null 2>&1\n' "$RESOURCE" \
  > /etc/cron.d/soundwatch-verify-backup
chmod 644 /etc/cron.d/soundwatch-verify-backup
echo "== installed; verifying the newest dump now:"
RESOURCE=$RESOURCE /root/verify-backup.sh
EOF
    ;;
  --file)
    [ -n "${2:-}" ] || { echo "--file needs a path on the droplet" >&2; exit 2; }
    remote "RESOURCE='$RESOURCE' DUMP='$2' bash -s" <<EOF
$REMOTE_BODY
EOF
    ;;
  ""|--run)
    remote "RESOURCE='$RESOURCE' bash -s" <<EOF
$REMOTE_BODY
EOF
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac

#!/usr/bin/env bash
# prod-backup.sh — manage nightly Postgres backups on the prod droplet.
#
#   scripts/prod-backup.sh install   install/refresh the backup script + nightly cron, run one backup now
#   scripts/prod-backup.sh run       trigger a backup immediately
#   scripts/prod-backup.sh status    show the last log lines and the stored dumps
#   scripts/prod-backup.sh fetch     copy the newest dump to ~/soundwatch-prod-backups/ (off-droplet copy)
#
# The remote side dumps ONE named Coolify resource with pg_dump -Fc, keeps 14
# days in /root/db-backups, and logs every run to backup.log. Dumps stay on
# the droplet — run `fetch` now and then (or enable DO droplet Backups) for
# off-droplet coverage.
#
# WHICH DATABASE: selected by `coolify.resourceName`, not by name prefix.
# A staging stack joined this droplet on 2026-08-14 and `--filter name=postgres-`
# matched both; `head -1` picked staging. For a month the nightly job dumped
# 2-3 GB of simulated data, logged OK, and the 14-day rotation then deleted
# every real backup. The script now refuses to run unless exactly one container
# carries the expected label, and it records the row counts it dumped so a
# wrong target is visible in the log rather than only in the file size.
#
# RESTORING (verified 2026-09-16 against a scratch DB):
#   createdb restored && psql -d restored -c 'CREATE EXTENSION IF NOT EXISTS timescaledb'
#   psql -d restored -c 'SELECT timescaledb_pre_restore()'
#   pg_restore -d restored --no-owner <dump>
#   psql -d restored -c 'SELECT timescaledb_post_restore()'
# The pre/post calls are REQUIRED — pg_dump warns about circular FK constraints
# on TimescaleDB's continuous_agg catalog, and a plain pg_restore leaves the
# hypertable and the continuous aggregate broken.
set -euo pipefail

HOST=${SW_PROD_HOST:-root@188.166.164.198}
KEY=${SW_PROD_SSH_KEY:-$HOME/.ssh/personal_digitalocean}
LOCAL_DIR=${SW_BACKUP_DIR:-$HOME/soundwatch-prod-backups}
# Coolify resource label of the database to back up. Staging is
# `staging-soundwatch-app`; production is `soundwatch`.
RESOURCE=${SW_DB_RESOURCE:-soundwatch}

remote() { ssh -i "$KEY" -o ConnectTimeout=10 "$HOST" "$@"; }

case "${1:-}" in
  install)
    # RESOURCE is passed explicitly: the heredoc below is quoted, so nothing
    # in it expands locally.
    remote "RESOURCE='$RESOURCE' bash -s" <<'EOF'
set -euo pipefail
: "${RESOURCE:?RESOURCE not passed through}"
mkdir -p /root/db-backups
cat > /root/db-backup.sh <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
BDIR=/root/db-backups
RESOURCE=${RESOURCE}
log() { echo "\$(date -Is) \$*" >> "\$BDIR/backup.log"; }

# Exactly one container, chosen by label. Never "the first postgres-*": that
# picked staging for a month and nothing noticed. Refuse rather than guess.
mapfile -t CIDS < <(docker ps --format '{{.Names}}' \
  --filter "label=coolify.resourceName=\$RESOURCE" | grep '^postgres-' || true)
if [ "\${#CIDS[@]}" -ne 1 ]; then
  log "ERROR: expected 1 postgres container for resource '\$RESOURCE', found \${#CIDS[@]}"
  docker ps --format '  {{.Names}} resource={{.Label "coolify.resourceName"}}' \
    | grep -E 'postgres|timescale' >> "\$BDIR/backup.log" 2>&1 || true
  exit 1
fi
CID="\${CIDS[0]}"

# What is actually in there. Logged beside the dump so a wrong target shows up
# as wrong NUMBERS, not just as an unexpected file size.
q() { docker exec "\$CID" psql -U soundwatch -d soundwatch -tAc "\$1" 2>/dev/null | tr -d ' \r'; }
N_SENSORS="\$(q 'select count(*) from sensors')"
N_READINGS="\$(q 'select count(*) from readings')"
COUNTS="\${N_SENSORS:-?} sensors / \${N_READINGS:-?} readings"

F="\$BDIR/soundwatch-\$(date +%F).dump"
if docker exec "\$CID" pg_dump -U soundwatch -Fc -d soundwatch > "\$F.tmp" 2>> "\$BDIR/backup.log"; then
  mv "\$F.tmp" "\$F"
  log "OK \$(du -h "\$F" | cut -f1) \$F [\$RESOURCE: \$COUNTS]"
else
  rm -f "\$F.tmp"
  log "ERROR: pg_dump failed for \$CID (\$RESOURCE)"
  exit 1
fi
find "\$BDIR" -name 'soundwatch-*.dump' -mtime +14 -delete
SCRIPT
chmod +x /root/db-backup.sh
printf '15 3 * * * root /root/db-backup.sh\n' > /etc/cron.d/soundwatch-db-backup
chmod 644 /etc/cron.d/soundwatch-db-backup
/root/db-backup.sh
echo "== installed; first backup taken:"
tail -2 /root/db-backups/backup.log
ls -lh /root/db-backups/ | tail -5
EOF
    ;;
  run)
    remote '/root/db-backup.sh && tail -1 /root/db-backups/backup.log'
    ;;
  status)
    remote 'tail -5 /root/db-backups/backup.log 2>/dev/null || echo "no log — not installed?"; echo; ls -lh /root/db-backups/ 2>/dev/null | tail -8'
    ;;
  fetch)
    mkdir -p "$LOCAL_DIR"
    NEWEST=$(remote 'ls -1t /root/db-backups/*.dump 2>/dev/null | head -1')
    [ -n "$NEWEST" ] || { echo "no dumps on the droplet"; exit 1; }
    scp -i "$KEY" "$HOST:$NEWEST" "$LOCAL_DIR/"
    ls -lh "$LOCAL_DIR" | tail -3
    ;;
  *)
    sed -n '2,8p' "$0"
    exit 1
    ;;
esac

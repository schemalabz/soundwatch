#!/usr/bin/env bash
# prod-backup.sh — manage nightly Postgres backups on the prod droplet.
#
#   scripts/prod-backup.sh install   install/refresh the backup script + nightly cron, run one backup now
#   scripts/prod-backup.sh run       trigger a backup immediately
#   scripts/prod-backup.sh status    show the last log lines and the stored dumps
#   scripts/prod-backup.sh fetch     copy the newest dump to ~/soundwatch-prod-backups/ (off-droplet copy)
#
# The remote side dumps the compose stack's postgres container (name prefix
# `postgres-`, stable across Coolify redeploys) with pg_dump -Fc, keeps 14
# days in /root/db-backups, and logs every run to backup.log. Dumps stay on
# the droplet — run `fetch` now and then (or enable DO droplet Backups) for
# off-droplet coverage.
set -euo pipefail

HOST=${SW_PROD_HOST:-root@188.166.164.198}
KEY=${SW_PROD_SSH_KEY:-$HOME/.ssh/personal_digitalocean}
LOCAL_DIR=${SW_BACKUP_DIR:-$HOME/soundwatch-prod-backups}

remote() { ssh -i "$KEY" -o ConnectTimeout=10 "$HOST" "$@"; }

case "${1:-}" in
  install)
    remote 'bash -s' <<'EOF'
set -euo pipefail
mkdir -p /root/db-backups
cat > /root/db-backup.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
BDIR=/root/db-backups
CID=$(docker ps -q --filter name=postgres- | head -1)
if [ -z "$CID" ]; then echo "$(date -Is) ERROR: postgres container not found" >> "$BDIR/backup.log"; exit 1; fi
F="$BDIR/soundwatch-$(date +%F).dump"
if docker exec "$CID" pg_dump -U soundwatch -Fc -d soundwatch > "$F.tmp" 2>> "$BDIR/backup.log"; then
  mv "$F.tmp" "$F"
  echo "$(date -Is) OK $(du -h "$F" | cut -f1) $F" >> "$BDIR/backup.log"
else
  rm -f "$F.tmp"
  echo "$(date -Is) ERROR: pg_dump failed" >> "$BDIR/backup.log"
  exit 1
fi
find "$BDIR" -name "*.dump" -mtime +14 -delete
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

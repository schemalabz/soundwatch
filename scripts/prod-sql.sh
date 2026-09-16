#!/usr/bin/env bash
# prod-sql.sh — run a read-only query against the production Soundwatch DB.
#
# Every fleet verdict so far has been an ad-hoc ssh + docker exec + psql
# incantation reconstructed from a handoff doc. This is that incantation, once,
# reviewable, with the container discovered rather than pasted.
#
# The broker's ACL makes external MQTT sniffing impossible by design, so the
# database is THE way to check what the fleet is doing — which makes this the
# most-repeated command in the program.
#
#   scripts/prod-sql.sh "select count(*) from readings;"
#   scripts/prod-sql.sh -f query.sql
#   scripts/prod-sql.sh --csv "select * from readings limit 10;"
#   scripts/prod-sql.sh --containers   # list every postgres/timescale container (debug which one NR==1 picks)
#
# Read-only by convention, not by enforcement: it runs as the DB owner. Do not
# put writes through it — migrations belong in prisma/migrations and reach prod
# through a Coolify deploy.
set -euo pipefail

HOST="${SOUNDWATCH_PROD_HOST:-188.166.164.198}"
KEY="${SOUNDWATCH_PROD_KEY:-$HOME/.ssh/personal_digitalocean}"
DB_USER="${SOUNDWATCH_DB_USER:-soundwatch}"
DB_NAME="${SOUNDWATCH_DB_NAME:-soundwatch}"
# Staging came up as a second Coolify resource on the same droplet, so
# `postgres-*` matches two containers and picking the first silently answered
# about invented data for a month. Select by the Coolify resource label instead:
# container names carry a redeploy-specific suffix, the label does not.
#   production -> coolify.resourceName=soundwatch
#   staging    -> coolify.resourceName=staging-soundwatch-app
DB_RESOURCE="${SOUNDWATCH_DB_RESOURCE:-soundwatch}"
# Escape hatch: an exact container name, for a stack that predates the label.
DB_CONTAINER="${SOUNDWATCH_DB_CONTAINER:-}"

PSQL_FLAGS=()
SQL=""
LIST_CONTAINERS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --csv)  PSQL_FLAGS+=(--csv); shift ;;
    -f)     SQL="$(cat "$2")"; shift 2 ;;
    --containers) LIST_CONTAINERS=1; shift ;;
    -h|--help)
            sed -n '2,18p' "$0"; exit 0 ;;
    *)      SQL="$1"; shift ;;
  esac
done

if [ "$LIST_CONTAINERS" -eq 1 ]; then
  ssh -i "$KEY" -o ConnectTimeout=15 "root@$HOST" \
    "docker ps --format '{{.Names}}\t{{.Label \"coolify.resourceName\"}}\t{{.CreatedAt}}' | grep -E 'postgres|timescale'"
  exit 0
fi

if [ -z "$SQL" ]; then echo "prod-sql.sh: no query given (see -h)" >&2; exit 2; fi

ssh -i "$KEY" -o ConnectTimeout=15 "root@$HOST" bash -s -- "${PSQL_FLAGS[@]+"${PSQL_FLAGS[@]}"}" <<REMOTE
set -euo pipefail
pinned="$DB_CONTAINER"
if [ -n "\$pinned" ]; then
  container="\$pinned"
else
  # Exactly one container, selected by the resource label. Never "the first
  # match" — that is the bug this replaces.
  candidates="\$(docker ps --format '{{.Names}}' \
    --filter 'label=coolify.resourceName=$DB_RESOURCE' | grep '^postgres-' || true)"
  count="\$(printf '%s\n' "\$candidates" | grep -c . || true)"
  if [ "\$count" -ne 1 ]; then
    echo "prod-sql.sh: expected exactly 1 postgres container for resource '$DB_RESOURCE', found \$count." >&2
    echo "Every postgres container on this host:" >&2
    docker ps --format '  {{.Names}}  resource={{.Label "coolify.resourceName"}}' \
      | grep -E 'postgres|timescale' >&2 || true
    echo "Set SOUNDWATCH_DB_RESOURCE=<resourceName>, or SOUNDWATCH_DB_CONTAINER=<exact name>." >&2
    exit 1
  fi
  container="\$candidates"
fi
docker exec -i "\$container" psql -U "$DB_USER" -d "$DB_NAME" "\$@" <<'SQLEOF'
$SQL
SQLEOF
REMOTE

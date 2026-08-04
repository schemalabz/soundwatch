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
#
# Read-only by convention, not by enforcement: it runs as the DB owner. Do not
# put writes through it — migrations belong in prisma/migrations and reach prod
# through a Coolify deploy.
set -euo pipefail

HOST="${SOUNDWATCH_PROD_HOST:-188.166.164.198}"
KEY="${SOUNDWATCH_PROD_KEY:-$HOME/.ssh/personal_digitalocean}"
DB_USER="${SOUNDWATCH_DB_USER:-soundwatch}"
DB_NAME="${SOUNDWATCH_DB_NAME:-soundwatch}"

PSQL_FLAGS=()
SQL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --csv)  PSQL_FLAGS+=(--csv); shift ;;
    -f)     SQL="$(cat "$2")"; shift 2 ;;
    -h|--help)
            sed -n '2,17p' "$0"; exit 0 ;;
    *)      SQL="$1"; shift ;;
  esac
done

if [ -z "$SQL" ]; then echo "prod-sql.sh: no query given (see -h)" >&2; exit 2; fi

ssh -i "$KEY" -o ConnectTimeout=15 "root@$HOST" bash -s -- "${PSQL_FLAGS[@]+"${PSQL_FLAGS[@]}"}" <<REMOTE
set -euo pipefail
# Discover the app's Postgres rather than hardcoding a Coolify-generated name
# (it changes on redeploy), and skip coolify-db, which is Coolify's own store.
container="\$(docker ps --format '{{.Names}} {{.Image}}' \
  | grep -E 'postgres|timescale' | grep -v '^coolify-db ' | awk 'NR==1{print \$1}')"
if [ -z "\$container" ]; then echo "no app postgres container found" >&2; exit 1; fi
docker exec -i "\$container" psql -U "$DB_USER" -d "$DB_NAME" "\$@" <<'SQLEOF'
$SQL
SQLEOF
REMOTE

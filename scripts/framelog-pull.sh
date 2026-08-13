#!/usr/bin/env bash
# Nightly frame-log collection.
#
# Pulls YESTERDAY's frame-log file from each live bench unit. Runs on the
# droplet from cron; lives here rather than only in /root so it is reviewable
# and deploys with everything else.
#
#   cron:  0 2 * * *  /root/framelog-pull.sh >> /var/log/framelog-pull.log 2>&1
#
# TIME, because every part of this is a chance to be wrong:
#   * The droplet is Etc/UTC and the database stores NAIVE UTC. Nothing here
#     converts to Europe/Athens; if you read these logs against local time,
#     you are three hours out.
#   * The device names its file from its own RTC in UTC, so "yesterday" must be
#     computed with `date -u`. `date -d yesterday` without -u would be right by
#     accident on a UTC box and wrong the moment it is not.
#   * Device clocks run AHEAD of real time, measured up to 35 minutes. A unit
#     therefore rotates to the next day file EARLY, never late, so by 02:00 UTC
#     every unit has certainly closed yesterday's file. That margin is the
#     reason for 02:00 rather than 00:30.
#   * A fast clock also means a unit writes its final pre-midnight intervals
#     into the NEXT day's file. Frame-log day boundaries are therefore soft by
#     up to ~35 minutes. Join on the epoch inside each line, never on the file's
#     day tag, when precision matters.
#   * Ordering anywhere else in this system is by received_at, never
#     recorded_at. Nothing here orders by device time at all.
#
# Re-running is safe: chunks are immutable and stored with an idempotent upsert,
# and each unit resumes from what already landed.
set -uo pipefail

CONCURRENCY="${CONCURRENCY:-4}"
CAP="${CAP:-16777216}"          # generous; the pull stops at EOF, not at this
PER_UNIT_TIMEOUT="${PER_UNIT_TIMEOUT:-7200}"   # ~64 min/unit-day measured, x2 headroom
NET=x10j4iqsktug7cszqxgu10a8

DAY="$(date -u -d yesterday +%y%m%d)"
PG="$(docker ps -qf name=postgres-x10 | head -1)"
ING="$(docker ps -qf name=mqtt-ingester | head -1)"
if [ -z "$PG" ] || [ -z "$ING" ]; then echo "postgres or ingester container not found" >&2; exit 1; fi
IMG="$(docker inspect -f '{{.Config.Image}}' "$ING")"

psql_q() { docker exec -i "$PG" psql -U soundwatch -d soundwatch -tAc "$1"; }

# Targets discovered rather than hardcoded, so a unit that is re-tokened or
# retired does not leave a line here pulling from a device that no longer
# exists. Bench only for now: pulling costs the serving unit roughly 20% of its
# frames while it runs, which is acceptable in the office and not yet a cost we
# have chosen to pay on installed units. To include the field fleet, drop the
# is_experimental clause.
TARGETS="$(psql_q "select device_id from sensors
                   where is_experimental = true
                     and last_seen_at > now() - interval '2 hours'
                   order by device_id")"

if [ -z "$TARGETS" ]; then echo "$(date -u +%FT%TZ) no live bench units — nothing to pull"; exit 0; fi

echo "=== $(date -u +%FT%TZ) nightly framelog pull, day $DAY (UTC), concurrency $CONCURRENCY ==="
echo "targets: $(echo "$TARGETS" | tr '\n' ' ')"

pull_one() {
  local T="$1" OFF
  # Resume from the contiguous end of what already landed for this (unit, day).
  OFF="$(psql_q "select coalesce(max(\"offset\" + length(data)), 0)
                 from frame_log_chunks where device_id = '$T' and day = '$DAY'")"
  echo "--- $(date -u +%FT%TZ) $T day $DAY resume@$OFF"
  timeout "$PER_UNIT_TIMEOUT" docker run --rm --network "$NET" \
    -e MQTT_BROKER_URL=mqtt://mosquitto:1884 \
    "$IMG" npx tsx scripts/fetch-framelog.ts "$T" "$DAY" "$OFF" "$CAP" 2>&1 \
    | sed "s/^/[$T] /"
  echo "--- $(date -u +%FT%TZ) $T exit ${PIPESTATUS[0]}"
}

running=0
for T in $TARGETS; do
  pull_one "$T" &
  running=$((running + 1))
  if [ "$running" -ge "$CONCURRENCY" ]; then wait -n 2>/dev/null || wait; running=$((running - 1)); fi
done
wait

echo "=== $(date -u +%FT%TZ) nightly pull complete ==="
# What actually landed, which is the only report worth reading. Compare
# chunks against reached/360: a shortfall means chunks were lost in flight and
# the reassembled file has silent holes.
psql_q "select device_id || ' ' || day || ': ' || count(*) || ' chunks, reached ' ||
               (max(\"offset\") + 360) || ', gaps ' ||
               (select count(*) from (
                  select \"offset\", length(data) len,
                         lead(\"offset\") over (order by \"offset\") nx
                  from frame_log_chunks f2
                  where f2.device_id = f.device_id and f2.day = f.day) g
                where nx is not null and nx <> \"offset\" + len)
        from frame_log_chunks f where day = '$DAY' group by device_id, day order by device_id"

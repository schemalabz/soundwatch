import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { FreshnessResponse, FreshnessSensor } from "@/types/freshness";

// Fleet data-freshness overview for the dev dashboard: per sensor, when the
// newest reading was recorded (staleness), how far back the history reaches
// (span), and the latest level.
//
// Query strategy: LEFT JOIN LATERAL first/last per sensor. Both directions
// are single probes of the (sensor_id, recorded_at DESC) index — milliseconds
// even with millions of rows. A groupBy or count(*) over the readings table
// would scan it; do not "simplify" this into one.

export const dynamic = "force-dynamic";

interface FreshnessSqlRow {
  id: string;
  device_id: string;
  name: string | null;
  last_at: Date | null;
  first_at: Date | null;
  last_laeq: number | null;
}

export async function GET() {
  const rows = await prisma.$queryRaw<FreshnessSqlRow[]>`
    SELECT s.id, s.device_id, s.name,
           last.received_at AS last_at, last.laeq AS last_laeq,
           first.recorded_at AS first_at
    FROM sensors s
    LEFT JOIN LATERAL (
      SELECT received_at, laeq FROM readings r
      WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
    ) last ON true
    LEFT JOIN LATERAL (
      SELECT recorded_at FROM readings r
      WHERE r.sensor_id = s.id ORDER BY recorded_at ASC LIMIT 1
    ) first ON true
    ORDER BY s.device_id`;

  // Staleness reads received_at (server insert time): device clocks drift up to
  // ~10 min FORWARD between NTP syncs, so recorded_at would report a drifted
  // unit as fresher than it is and then stale when it resyncs. The history span
  // still reads recorded_at — "how far back does the sound go" is a question
  // about the device clock, and its error there is the honest one.
  const nowMs = Date.now();
  const sensors: FreshnessSensor[] = rows.map((r) => {
    const lastMs = r.last_at?.getTime() ?? null;
    const firstMs = r.first_at?.getTime() ?? null;
    return {
      id: r.id,
      deviceId: r.device_id,
      name: r.name,
      secondsAgo: lastMs == null ? null : Math.max(0, Math.round((nowMs - lastMs) / 1000)),
      spanDays: lastMs == null || firstMs == null ? null : (lastMs - firstMs) / 86_400_000,
      lastLaeq: r.last_laeq,
    };
  });

  const reporting = sensors.filter((s) => s.secondsAgo != null && s.secondsAgo < 60);
  const newest = sensors.reduce<number | null>(
    (best, s) => (s.secondsAgo == null ? best : best == null ? s.secondsAgo : Math.min(best, s.secondsAgo)),
    null
  );
  const oldestDays = sensors.reduce<number | null>(
    (best, s) => (s.spanDays == null ? best : best == null ? s.spanDays : Math.max(best, s.spanDays)),
    null
  );

  return NextResponse.json<FreshnessResponse>({
    now: new Date(nowMs).toISOString(),
    fleet: {
      total: sensors.length,
      reportingLast60s: reporting.length,
      newestSecondsAgo: newest,
      oldestDataDays: oldestDays,
    },
    sensors,
  });
}

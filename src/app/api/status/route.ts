import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Network status: per public sensor, the age of its newest reading plus a
// 30-day liveness map in 6-hour buckets (120 cells). The bucket query is one
// grouped range scan over the last 30 days per the (sensor_id, recorded_at)
// index; distinct 6h buckets keep the payload tiny (≤120 ints per sensor).

export const dynamic = "force-dynamic";

const BUCKET_S = 6 * 3600;
const WINDOW_DAYS = 30;

interface MetaRow {
  id: string;
  device_id: string;
  name: string | null;
  last_at: Date | null;
}
interface BucketRow {
  sensor_id: string;
  b: bigint;
}

export async function GET() {
  const nowMs = Date.now();
  const [meta, buckets] = await Promise.all([
    prisma.$queryRaw<MetaRow[]>`
      SELECT s.id, s.device_id, s.name, last.recorded_at AS last_at
      FROM sensors s
      LEFT JOIN LATERAL (
        SELECT recorded_at FROM readings r
        WHERE r.sensor_id = s.id ORDER BY recorded_at DESC LIMIT 1
      ) last ON true
      WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL
      ORDER BY s.name NULLS LAST`,
    prisma.$queryRaw<BucketRow[]>`
      SELECT r.sensor_id, floor(extract(epoch FROM r.recorded_at) / ${BUCKET_S})::bigint AS b
      FROM readings r
      JOIN sensors s ON s.id = r.sensor_id
      WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL
        AND r.recorded_at > (now() AT TIME ZONE 'utc') - make_interval(days => ${WINDOW_DAYS}::int)
      GROUP BY 1, 2`,
  ]);

  const nowBucket = Math.floor(nowMs / 1000 / BUCKET_S);
  const firstBucket = nowBucket - Math.floor((WINDOW_DAYS * 86400) / BUCKET_S) + 1;
  const cellCount = nowBucket - firstBucket + 1;

  const covered = new Map<string, Set<number>>();
  for (const row of buckets) {
    const idx = Number(row.b) - firstBucket;
    if (idx < 0 || idx >= cellCount) continue;
    let set = covered.get(row.sensor_id);
    if (!set) covered.set(row.sensor_id, (set = new Set()));
    set.add(idx);
  }

  const sensors = meta.map((m) => {
    const set = covered.get(m.id);
    // Compact bitstring: "1" = at least one reading in that 6h bucket.
    let cells = "";
    for (let i = 0; i < cellCount; i++) cells += set?.has(i) ? "1" : "0";
    return {
      id: m.id,
      deviceId: m.device_id,
      name: m.name,
      secondsAgo: m.last_at ? Math.max(0, Math.round((nowMs - m.last_at.getTime()) / 1000)) : null,
      cells,
    };
  });

  return NextResponse.json({ bucketHours: BUCKET_S / 3600, windowDays: WINDOW_DAYS, sensors });
}

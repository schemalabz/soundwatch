import { NextResponse } from "next/server";
import type { Jsonified } from "@/lib/api/json";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_RAW } from "@/lib/server/filterSql";

// Network status: per public sensor, the age of its newest reading plus a
// 30-day liveness map in 6-hour buckets (120 cells). The bucket query is one
// grouped read of the readings_hour_bins rollup; distinct 6h buckets keep
// the payload tiny (≤120 ints per sensor).

export const dynamic = "force-dynamic";

const BUCKET_S = 6 * 3600;
const WINDOW_DAYS = 30;

interface MetaRow {
  id: string;
  name: string | null;
  last_at: Date | null;
}
interface BucketRow {
  sensor_id: string;
  b: bigint;
}
interface IngestRow {
  h: bigint;
  n: bigint;
}

const INGEST_DAYS = 7;

export async function GET() {
  const nowMs = Date.now();
  const [meta, buckets, ingest] = await Promise.all([
    prisma.$queryRaw<MetaRow[]>`
      SELECT s.id, s.name, last.received_at AS last_at
      FROM sensors s
      LEFT JOIN LATERAL (
        -- received_at: a drifting device clock must not decide liveness.
        SELECT received_at FROM readings r
        WHERE r.sensor_id = s.id ORDER BY received_at DESC LIMIT 1
      ) last ON true
      WHERE ${PUBLIC_SENSOR_RAW}
      ORDER BY s.name NULLS LAST`,
    // Liveness cells: was this unit HEARD FROM during this 6-hour window.
    //
    // This used to read the hourly rollup, which buckets on recorded_at — the
    // device clock — and that made the strip capable of reporting the exact
    // opposite of the truth. A unit offline Monday to Wednesday reconnects on
    // Thursday and flushes its store-and-forward buffer; those rows carry
    // Monday-to-Wednesday timestamps, so three days of outage turn green
    // retroactively and uptime reads 100%. The rollup also carries
    // `WHERE laeq IS NOT NULL`, and computeFlavor1 returns a null laeq when
    // energySum <= 0 — so a unit with a dead microphone, still publishing
    // every interval, vanished from the strip entirely while the page showed
    // a small secondsAgo beside it.
    //
    // received_at is the server's own insert time. No device can be wrong
    // about it, and presence is a question about arrival, not about sound.
    //
    // Shape matters here: an EXISTS semi-join over 7 days makes the planner
    // materialize ~500k rows (5.1 s). LATERAL + LIMIT 1 turns it into one
    // index probe per (sensor, cell) — 50 x 28 — against the
    // (sensor_id, received_at DESC) index from migration 0017. Measured 66 ms.
    prisma.$queryRaw<BucketRow[]>`
      SELECT s.id AS sensor_id, c.b
      FROM sensors s
      CROSS JOIN generate_series(
        floor(extract(epoch FROM now()) / ${BUCKET_S})::bigint
          - (${WINDOW_DAYS}::bigint * 86400 / ${BUCKET_S}) + 1,
        floor(extract(epoch FROM now()) / ${BUCKET_S})::bigint) AS c(b)
      JOIN LATERAL (
        SELECT 1 FROM readings r
        WHERE r.sensor_id = s.id
          AND r.received_at >= to_timestamp(c.b * ${BUCKET_S})
          AND r.received_at <  to_timestamp((c.b + 1) * ${BUCKET_S})
        LIMIT 1
      ) hit ON true
      WHERE ${PUBLIC_SENSOR_RAW}`,
    // Ingest volume stays on the rollup, and stays on recorded_at. It answers
    // a different question from the strip above — "how much sound have we
    // captured for these hours", not "was this unit reachable" — and the
    // label says Μετρήσεις ανά ώρα, not received-per-hour. The rollup makes it
    // ~10x cheaper than the equivalent raw scan.
    prisma.$queryRaw<IngestRow[]>`
      SELECT extract(epoch FROM rb.bucket)::bigint / 3600 AS h, sum(rb.n)::bigint AS n
      FROM readings_hour_bins rb
      JOIN sensors s ON s.id = rb.sensor_id
      WHERE ${PUBLIC_SENSOR_RAW}
        AND rb.bucket > now() - make_interval(days => ${INGEST_DAYS}::int)
      GROUP BY 1
      ORDER BY 1`,
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
      name: m.name,
      secondsAgo: m.last_at ? Math.max(0, Math.round((nowMs - m.last_at.getTime()) / 1000)) : null,
      cells,
    };
  });

  return NextResponse.json(
    buildPayload(sensors, ingest.map((r) => ({ t: Number(r.h) * 3600_000, n: Number(r.n) })))
  );
}

// The response shape is defined by this function, and StatusResponse is derived
// from it. The status page imports that type instead of restating the shape.
// Jsonified applies what JSON does to any Date on the way out.
function buildPayload(
  sensors: {
    id: string;
    name: string | null;
    secondsAgo: number | null;
    cells: string;
  }[],
  hours: { t: number; n: number }[]
) {
  return {
    bucketHours: BUCKET_S / 3600,
    windowDays: WINDOW_DAYS,
    sensors,
    ingest: { days: INGEST_DAYS, hours },
  };
}

export type StatusResponse = Jsonified<ReturnType<typeof buildPayload>>;
export type StatusSensor = StatusResponse["sensors"][number];

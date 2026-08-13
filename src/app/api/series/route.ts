import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { locationSql } from "@/lib/server/filterSql";
import { BinAccumulator, type LevelSummary } from "@/lib/server/levelBins";
import { instantMatches, parseWireFilters } from "@/lib/dashboard/filters";
import { athensWallTime } from "@/lib/dashboard/time";
import { needsRawReadings, resolveBucket } from "@/lib/dashboard/buckets";
import { BIN_LO, BIN_HI, BIN_COUNT } from "@/lib/server/levelBins";

// Grouped series over the FILTERED time-set, network-wide, for the charts
// view: hour-of-day (24), day-of-week (7), month (12), and a time series at
// the requested resolution.
//
// TWO sources, one rollup. At an hour or coarser the rows come from the
// readings_hour_bins continuous aggregate — a small scan at any domain
// length. Below an hour the aggregate cannot answer (it IS hourly), so the
// same shape is computed from raw `readings` with the same 1-dB
// width_bucket the aggregate uses. Both hand identical {t, bin, energy,
// lmax, n} rows to the same JS accumulation, so a 1-minute chart and a
// 1-hour chart agree wherever they overlap.
//
// The raw path is bounded by resolveBucket: sub-hour resolutions are only
// ever served for domains short enough that the scan stays inside a chunk
// or two (2000 points max, ~33 h of one-minute buckets).
//
// The Athens wall-time mapping AND the day/hour/month/range filters run here
// per distinct hour through the exact same DST-correct instantMatches the
// client uses — the two can never disagree. L50/L10/L90 interpolate from the
// bins (≤0.1 dB vs exact); the energy mean and Lmax are exact. The aggregate
// is real-time (materialized_only = false), so the current hour is always
// included.

export const dynamic = "force-dynamic";

interface BinSqlRow {
  t: bigint; // UTC epoch SECONDS of the bucket start
  bin: number;
  energy: number;
  lmax: number;
  n: bigint;
}

export type SeriesBucket = LevelSummary;

/**
 * The timeline key for a bucket: Athens WALL time expressed as if UTC, so the
 * client formats it with UTC getters and never re-applies a zone.
 *
 * Day and week keys are computed here rather than in SQL because a UTC
 * epoch/86400 grouping is not the Athens day — the aggregate hands us hourly
 * rows and this is where they become local days. Athens offsets are whole
 * hours, so a sub-hour bucket's within-the-hour position is identical in both
 * zones and can simply be carried across.
 */
function wallBucketKey(startMs: number, w: ReturnType<typeof athensWallTime>, bucketS: number): number {
  const dayKey = Date.UTC(w.year, w.month, w.day);
  if (bucketS >= 604_800) {
    const sinceMonday = (w.dow + 6) % 7; // dow: 0 = Sunday
    return dayKey - sinceMonday * 86_400_000;
  }
  if (bucketS >= 86_400) return dayKey;
  const hourKey = Date.UTC(w.year, w.month, w.day, w.hour);
  if (bucketS >= HOUR_S_MS / 1000) return hourKey;
  return hourKey + (startMs % HOUR_S_MS);
}

const HOUR_S_MS = 3600_000;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const fromMs = Number(q.get("from"));
  if (!Number.isFinite(fromMs) || fromMs <= 0) {
    return NextResponse.json({ error: "from= requires epoch ms" }, { status: 400 });
  }
  const filters = parseWireFilters(q);
  // Resolve against the actual domain so a stale URL or a moved "now" cannot
  // ask for 90 days of one-minute buckets.
  const bucket = resolveBucket(q.get("bucket"), Math.max(1, Date.now() - fromMs));
  const bucketS = bucket.seconds;
  // Optional single-sensor scope (the sensor pane's 24h chart) — validated
  // uuid, safe to inline.
  const sensorParam = q.get("sensor");
  const sensorSql =
    sensorParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sensorParam)
      ? `AND rb.sensor_id = '${sensorParam}'`
      : "";

  // The domain edge is quantized down to a bucket boundary: the partial first
  // bucket is included whole, consistent with the real-time tail including the
  // partial current one.
  const fromIso = new Date(Math.floor(fromMs / (bucketS * 1000)) * bucketS * 1000).toISOString();
  const publicWhere = "s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL";

  const rows = needsRawReadings(bucketS)
    ? // Sub-hour: the aggregate is hourly and cannot answer. Same 1-dB
      // width_bucket it uses, applied to raw rows at this resolution.
      await prisma.$queryRawUnsafe<BinSqlRow[]>(`
        SELECT (EXTRACT(epoch FROM r.recorded_at)::bigint / ${bucketS}) * ${bucketS} AS t,
               width_bucket(r.laeq, ${BIN_LO}, ${BIN_HI}, ${BIN_COUNT}) AS bin,
               sum(power(10, r.laeq / 10)) AS energy,
               max(COALESCE(r.lmax_est, r.laeq)) AS lmax,
               count(*)::bigint AS n
        FROM readings r
        JOIN sensors s ON s.id = r.sensor_id
        WHERE ${publicWhere}
          AND r.laeq IS NOT NULL
          AND r.recorded_at >= '${fromIso}'::timestamptz
          ${locationSql(filters)}
          ${sensorSql.replace(/\brb\./g, "r.")}
        GROUP BY 1, 2`)
    : await prisma.$queryRawUnsafe<BinSqlRow[]>(`
        SELECT EXTRACT(epoch FROM rb.bucket)::bigint AS t,
               rb.bin,
               sum(rb.energy) AS energy,
               max(rb.lmax)   AS lmax,
               sum(rb.n)::bigint AS n
        FROM readings_hour_bins rb
        JOIN sensors s ON s.id = rb.sensor_id
        WHERE ${publicWhere}
          AND rb.bucket >= '${fromIso}'::timestamptz
          ${locationSql(filters)}
          ${sensorSql}
        GROUP BY 1, 2`);

  const dims = {
    hours: new Map<number, BinAccumulator>(),
    dows: new Map<number, BinAccumulator>(),
    months: new Map<number, BinAccumulator>(),
    timeline: new Map<number, BinAccumulator>(),
  };
  const into = (map: Map<number, BinAccumulator>, key: number, row: BinSqlRow) => {
    let acc = map.get(key);
    if (!acc) map.set(key, (acc = new BinAccumulator()));
    acc.add(row);
  };

  // Rows share bucket starts (one per occupied bin), so the wall-time mapping
  // and the filter verdict are memoized per distinct start.
  const startInfo = new Map<number, { hod: number; dow: number; mon: number; tKey: number } | null>();
  for (const row of rows) {
    const tSec = Number(row.t);
    let info = startInfo.get(tSec);
    if (info === undefined) {
      const startMs = tSec * 1000;
      // instantMatches is hour-grained, which is exactly the resolution the
      // filters express — every sub-hour bucket inside an hour gets the same
      // verdict, correctly.
      if (!instantMatches(filters, startMs)) {
        info = null;
      } else {
        const w = athensWallTime(startMs);
        info = { hod: w.hour, dow: w.dow, mon: w.month, tKey: wallBucketKey(startMs, w, bucketS) };
      }
      startInfo.set(tSec, info);
    }
    if (!info) continue;
    into(dims.hours, info.hod, row);
    into(dims.dows, info.dow, row);
    into(dims.months, info.mon + 1, row); // 1-12 on the wire, matching /api/aggregate
    into(dims.timeline, info.tKey, row);
  }

  const emit = (map: Map<number, BinAccumulator>): Record<number, SeriesBucket> =>
    Object.fromEntries([...map.entries()].map(([k, acc]) => [k, acc.out()]));
  const timeline = [...dims.timeline.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, acc]) => ({ t, ...acc.out() }));

  return NextResponse.json({
    // What was actually served — resolveBucket may have clamped the request.
    bucket: bucket.id,
    bucketSeconds: bucketS,
    hours: emit(dims.hours),
    dows: emit(dims.dows),
    months: emit(dims.months),
    timeline,
  });
}

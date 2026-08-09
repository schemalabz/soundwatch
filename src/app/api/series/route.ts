import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { locationSql } from "@/lib/server/filterSql";
import { BinAccumulator, type LevelSummary } from "@/lib/server/levelBins";
import { instantMatches, type DashboardFilters, type DayGroup, type HourPreset } from "@/lib/dashboard/filters";
import { athensWallTime } from "@/lib/dashboard/time";

// Grouped series over the FILTERED time-set, network-wide, for the charts
// view: hour-of-day (24), day-of-week (7), month (12), and a time series in
// day or hour buckets.
//
// Reads the readings_hour_bins continuous aggregate (per sensor × hour ×
// 1-dB bin), summed in SQL across the sensors the location filter keeps — a
// small rollup scan instead of the raw window. The Athens wall-time mapping
// AND the day/hour/month/range filters run here per distinct hour through
// the exact same DST-correct instantMatches the client uses — the two can
// never disagree. L50/L10/L90 interpolate from the bins (≤0.1 dB vs exact);
// the energy mean and Lmax are exact. The cagg is real-time
// (materialized_only = false), so the current hour is always included.

export const dynamic = "force-dynamic";

const HOUR_MS = 3600_000;

interface HourBinSqlRow {
  h: bigint; // UTC epoch hours
  bin: number;
  energy: number;
  lmax: number;
  n: bigint;
}

export type SeriesBucket = LevelSummary;

/** Reconstruct DashboardFilters from the wire params (period is already
 *  folded into from= by the client; locations are applied in SQL). */
function filtersFromQuery(q: URLSearchParams): DashboardFilters {
  const days = q.get("days");
  const hours = (q.get("hours") ?? "").split(",").filter(Boolean);
  const months = (q.get("months") ?? "")
    .split(",")
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  const ranges = (q.get("ranges") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.split(":").map(Number))
    .filter((a) => a.length === 2 && a.every((n) => Number.isFinite(n) && n > 0) && a[0] < a[1])
    .map(([startMs, endMs]) => ({ startMs, endMs }));
  return {
    ranges,
    period: null,
    days: new Set(days === "weekend" || days === "weekday" ? [days as DayGroup] : []),
    hours: new Set(hours.filter((h): h is HourPreset => ["day", "evening", "night", "peak"].includes(h))),
    months: new Set(months.map((m) => m - 1)),
    locations: [], // spatial filtering happens in SQL (locationSql), not here
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const fromMs = Number(q.get("from"));
  if (!Number.isFinite(fromMs) || fromMs <= 0) {
    return NextResponse.json({ error: "from= requires epoch ms" }, { status: 400 });
  }
  const bucket = q.get("bucket") === "hour" ? "hour" : "day";
  const filters = filtersFromQuery(q);

  // The domain edge is hour-quantized (floor): the partial first hour is
  // included whole — consistent with the real-time tail including the
  // partial current hour.
  const fromHourIso = new Date(Math.floor(fromMs / HOUR_MS) * HOUR_MS).toISOString();

  const rows = await prisma.$queryRawUnsafe<HourBinSqlRow[]>(`
    SELECT EXTRACT(epoch FROM rb.bucket)::bigint / 3600 AS h,
           rb.bin,
           sum(rb.energy) AS energy,
           max(rb.lmax)   AS lmax,
           sum(rb.n)::bigint AS n
    FROM readings_hour_bins rb
    JOIN sensors s ON s.id = rb.sensor_id
    WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL
      AND rb.bucket >= '${fromHourIso}'::timestamptz
      ${locationSql(q)}
    GROUP BY 1, 2`);

  const dims = {
    hours: new Map<number, BinAccumulator>(),
    dows: new Map<number, BinAccumulator>(),
    months: new Map<number, BinAccumulator>(),
    timeline: new Map<number, BinAccumulator>(),
  };
  const into = (map: Map<number, BinAccumulator>, key: number, row: HourBinSqlRow) => {
    let acc = map.get(key);
    if (!acc) map.set(key, (acc = new BinAccumulator()));
    acc.add(row);
  };

  // Rows share hours (one per occupied bin), so the wall-time mapping and
  // the filter verdict are memoized per distinct hour.
  const hourInfo = new Map<number, { hod: number; dow: number; mon: number; tKey: number } | null>();
  for (const row of rows) {
    const h = Number(row.h);
    let info = hourInfo.get(h);
    if (info === undefined) {
      const startMs = h * HOUR_MS;
      if (!instantMatches(filters, startMs)) {
        info = null;
      } else {
        const w = athensWallTime(startMs);
        // Timeline keys are Athens wall time expressed as if UTC — the
        // client formats them with UTC getters, pure wall time throughout.
        const tKey = bucket === "hour" ? Date.UTC(w.year, w.month, w.day, w.hour) : Date.UTC(w.year, w.month, w.day);
        info = { hod: w.hour, dow: w.dow, mon: w.month, tKey };
      }
      hourInfo.set(h, info);
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
    bucket,
    hours: emit(dims.hours),
    dows: emit(dims.dows),
    months: emit(dims.months),
    timeline,
  });
}

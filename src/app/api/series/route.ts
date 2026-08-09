import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { instantMatches, type DashboardFilters, type DayGroup, type HourPreset } from "@/lib/dashboard/filters";
import { athensWallTime } from "@/lib/dashboard/time";

// Grouped series over the FILTERED time-set, network-wide, for the charts
// view: hour-of-day (24), day-of-week (7), month (12), and a time series in
// day or hour buckets.
//
// Two deliberate departures from the obvious SQL:
// - No percentile_cont: an ordered-set aggregate forces a full sort of the
//   window per dimension (~17s at 90 days). Each (hour, 1-dB bin) group is
//   a plain hash aggregation instead, and L50/L10/L90 are interpolated from
//   the bins (error < 0.1 dB measured). Energy mean and Lmax stay exact.
// - No timezone math or filter predicates in SQL: AT TIME ZONE per row cost
//   ~7s over the 90-day window. SQL groups by UTC hour-epoch (integer
//   arithmetic); the Athens mapping AND the day/hour/month filters run here
//   per distinct hour (~2k of them) through the exact same DST-correct
//   instantMatches the client uses — the two can never disagree.

export const dynamic = "force-dynamic";

const BIN_LO = 30;
const BIN_HI = 91;
const BIN_COUNT = BIN_HI - BIN_LO; // 1-dB bins

const HOUR_MS = 3600_000;

interface BinSqlRow {
  h: bigint; // UTC epoch hours
  bin: number;
  energy: number;
  lmax: number;
  n: bigint;
}

export interface SeriesBucket {
  laeq: number;
  l50: number;
  l10: number;
  l90: number;
  lmax: number;
  n: number;
}

/** Low dB edge of a width_bucket bin (0 = underflow, BIN_COUNT+1 = overflow). */
function binLow(bin: number): number {
  if (bin <= 0) return BIN_LO - 1;
  if (bin > BIN_COUNT) return BIN_HI;
  return BIN_LO + (bin - 1);
}

class Accumulator {
  bins = new Map<number, number>();
  energy = 0;
  lmax = -Infinity;
  n = 0;

  add(row: BinSqlRow): void {
    const count = Number(row.n);
    this.bins.set(row.bin, (this.bins.get(row.bin) ?? 0) + count);
    this.energy += row.energy;
    this.lmax = Math.max(this.lmax, row.lmax);
    this.n += count;
  }

  /** Linear interpolation inside the 1-dB bin containing the p-quantile. */
  percentile(p: number): number {
    const sorted = [...this.bins.entries()].sort((a, b) => a[0] - b[0]);
    const rank = p * this.n;
    let cum = 0;
    for (const [bin, count] of sorted) {
      if (cum + count >= rank) {
        const frac = count > 0 ? (rank - cum) / count : 0;
        return binLow(bin) + frac;
      }
      cum += count;
    }
    return binLow(sorted[sorted.length - 1]?.[0] ?? 0) + 1;
  }

  out(): SeriesBucket {
    return {
      laeq: 10 * Math.log10(this.energy / this.n),
      l50: this.percentile(0.5),
      l10: this.percentile(0.9),
      l90: this.percentile(0.1),
      lmax: this.lmax,
      n: this.n,
    };
  }
}

/** Reconstruct DashboardFilters from the wire params (period is already
 *  folded into from= by the client). */
function filtersFromQuery(q: URLSearchParams): DashboardFilters {
  const days = q.get("days");
  const hours = (q.get("hours") ?? "").split(",").filter(Boolean);
  const months = (q.get("months") ?? "")
    .split(",")
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return {
    period: null,
    days: new Set(days === "weekend" || days === "weekday" ? [days as DayGroup] : []),
    hours: new Set(hours.filter((h): h is HourPreset => ["day", "evening", "night", "peak"].includes(h))),
    months: new Set(months.map((m) => m - 1)),
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

  const rows = await prisma.$queryRawUnsafe<BinSqlRow[]>(`
    SELECT EXTRACT(epoch FROM r.recorded_at)::bigint / 3600 AS h,
           width_bucket(r.laeq, ${BIN_LO}, ${BIN_HI}, ${BIN_COUNT}) AS bin,
           sum(power(10, r.laeq / 10)) AS energy,
           max(COALESCE(r.lmax_est, r.laeq)) AS lmax,
           count(*) AS n
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL
      AND r.laeq IS NOT NULL
      AND r.recorded_at > '${new Date(fromMs).toISOString()}'::timestamp
    GROUP BY 1, 2`);

  const dims = {
    hours: new Map<number, Accumulator>(),
    dows: new Map<number, Accumulator>(),
    months: new Map<number, Accumulator>(),
    timeline: new Map<number, Accumulator>(),
  };
  const into = (map: Map<number, Accumulator>, key: number, row: BinSqlRow) => {
    let acc = map.get(key);
    if (!acc) map.set(key, (acc = new Accumulator()));
    acc.add(row);
  };

  // Rows share hours (one per occupied bin), so the wall-time mapping and
  // the filter verdict are memoized per distinct hour.
  const hourInfo = new Map<number, { keep: boolean; hod: number; dow: number; mon: number; tKey: number } | null>();
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
        info = { keep: true, hod: w.hour, dow: w.dow, mon: w.month, tKey };
      }
      hourInfo.set(h, info);
    }
    if (!info) continue;
    into(dims.hours, info.hod, row);
    into(dims.dows, info.dow, row);
    into(dims.months, info.mon + 1, row); // 1-12 on the wire, matching /api/aggregate
    into(dims.timeline, info.tKey, row);
  }

  const emit = (map: Map<number, Accumulator>): Record<number, SeriesBucket> =>
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

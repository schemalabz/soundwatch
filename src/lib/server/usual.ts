// «Σε σχέση με το συνηθισμένο» — the server half: the bands from the hourly
// rollup, cached per (day, kind of day), and the ten-minute departures of a
// day held against them. The rule itself (what the band is, when a pill
// fires, what number it carries) is src/lib/dashboard/usual.ts, which the
// browser shares.
//
// Why the current day is excluded from the band: readings_hour_bins is
// real-time (materialized_only = false), so without the upper bound a
// departure would dilute its own baseline.

import { prisma } from "@/lib/db";
import { athensWallTime } from "@/lib/dashboard/time";
import { classify, USUAL_DAYS, USUAL_MIN_BUCKETS } from "@/lib/dashboard/usual";
import { athensTimeSql, PUBLIC_SENSOR_SQL } from "@/lib/server/filterSql";
import { BinAccumulator } from "@/lib/server/levelBins";
import type { DayType, DepartureEpisode, UsualBand } from "@/lib/api/dashboard";

/** A ten-minute figure needs this many readings to count at all. */
export const WINDOW_MIN_READINGS = 3;
export const WINDOW_S = 600;

const DAY_MS = 86_400_000;

/* --- the baseline, computed once per (day, day type) and cached ----------- */

/** sensorId → clock hour → band. Hours without support are absent. */
export type FleetUsual = Map<string, Map<number, UsualBand>>;

interface BinSqlRow {
  sensor_id: string;
  hour: number;
  bin: number;
  energy: number;
  lmax: number;
  n: bigint;
}
interface BucketSqlRow {
  sensor_id: string;
  hour: number;
  buckets: bigint;
}

function dayTypeSql(dayType: DayType, localCol: string): string {
  return `EXTRACT(dow FROM ${localCol}) ${dayType === "weekend" ? "IN" : "NOT IN"} (0, 6)`;
}

/**
 * Every public sensor's band for every clock hour of one day type, from the
 * hourly rollup: sensors × 24 × occupied 1-dB bins rows (tens of thousands at
 * most), percentiles interpolated from the bins exactly as /api/aggregate and
 * /api/series do, so the three never disagree about a level.
 */
async function computeFleetUsual(dayStartMs: number, dayType: DayType): Promise<FleetUsual> {
  const fromIso = new Date(dayStartMs - USUAL_DAYS * DAY_MS).toISOString();
  const toIso = new Date(dayStartMs).toISOString();
  const local = athensTimeSql("rb.bucket");
  const where = `
    WHERE ${PUBLIC_SENSOR_SQL}
      AND rb.bucket >= '${fromIso}'::timestamptz
      AND rb.bucket < '${toIso}'::timestamptz
      AND ${dayTypeSql(dayType, local)}`;
  const [bins, buckets] = await Promise.all([
    prisma.$queryRawUnsafe<BinSqlRow[]>(`
      SELECT rb.sensor_id,
             EXTRACT(hour FROM ${local})::int AS hour,
             rb.bin,
             sum(rb.energy) AS energy,
             max(rb.lmax)   AS lmax,
             sum(rb.n)::bigint AS n
      FROM readings_hour_bins rb
      JOIN sensors s ON s.id = rb.sensor_id
      ${where}
      GROUP BY 1, 2, 3`),
    prisma.$queryRawUnsafe<BucketSqlRow[]>(`
      SELECT rb.sensor_id,
             EXTRACT(hour FROM ${local})::int AS hour,
             count(DISTINCT rb.bucket)::bigint AS buckets
      FROM readings_hour_bins rb
      JOIN sensors s ON s.id = rb.sensor_id
      ${where}
      GROUP BY 1, 2`),
  ]);

  const accs = new Map<string, Map<number, BinAccumulator>>();
  for (const row of bins) {
    let hours = accs.get(row.sensor_id);
    if (!hours) accs.set(row.sensor_id, (hours = new Map()));
    let acc = hours.get(row.hour);
    if (!acc) hours.set(row.hour, (acc = new BinAccumulator()));
    acc.add(row);
  }
  const support = new Map<string, number>();
  for (const row of buckets) support.set(`${row.sensor_id}:${row.hour}`, Number(row.buckets));

  const out: FleetUsual = new Map();
  for (const [sensorId, hours] of accs) {
    const bands = new Map<number, UsualBand>();
    for (const [hour, acc] of hours) {
      const b = support.get(`${sensorId}:${hour}`) ?? 0;
      if (b < USUAL_MIN_BUCKETS) continue;
      const s = acc.out();
      bands.set(hour, { l90: s.l90, l50: s.l50, l10: s.l10, laeq: s.laeq, n: s.n, buckets: b });
    }
    out.set(sensorId, bands);
  }
  return out;
}

// The band for a day changes only as the previous days' hours close, and the
// open map asks for the same (day, type) on every poll. Ten minutes is long
// enough to make the polls free and short enough that a newly materialized
// hour shows up the same day.
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { expires: number; value: Promise<FleetUsual> }>();

export function fleetUsual(dayStartMs: number, dayType: DayType): Promise<FleetUsual> {
  const key = `${dayStartMs}:${dayType}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = computeFleetUsual(dayStartMs, dayType);
  cache.set(key, { expires: now + CACHE_TTL_MS, value });
  // A failed computation must not be served for ten minutes.
  value.catch(() => cache.delete(key));
  // Bound the cache: one map per (day, type) in use, a handful at most.
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  return value;
}

/** Test seam: forget everything computed so far. */
export function resetUsualCache(): void {
  cache.clear();
}

/* --- departures: ten-minute figures of one day against the band ----------- */

export interface TenMinuteWindow {
  sensorId: string;
  /** Window start, epoch ms, aligned to WINDOW_S. */
  tMs: number;
  laeq: number;
  n: number;
}

interface WindowSqlRow {
  sensor_id: string;
  t: bigint;
  laeq: number;
  n: bigint;
}

/** Energy-mean LAeq per public sensor per ten minutes, [fromMs, toMs), on the device clock. */
export async function tenMinuteWindows(fromMs: number, toMs: number): Promise<TenMinuteWindow[]> {
  const rows = await prisma.$queryRawUnsafe<WindowSqlRow[]>(`
    SELECT r.sensor_id,
           (EXTRACT(epoch FROM r.recorded_at)::bigint / ${WINDOW_S}) * ${WINDOW_S} AS t,
           10 * log(avg(power(10, r.laeq / 10))) AS laeq,
           count(*)::bigint AS n
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    WHERE ${PUBLIC_SENSOR_SQL}
      AND r.laeq IS NOT NULL
      AND r.recorded_at >= '${new Date(fromMs).toISOString()}'::timestamptz
      AND r.recorded_at < '${new Date(toMs).toISOString()}'::timestamptz
    GROUP BY 1, 2`);
  return rows
    .map((r) => ({ sensorId: r.sensor_id, tMs: Number(r.t) * 1000, laeq: r.laeq, n: Number(r.n) }))
    .filter((w) => w.n >= WINDOW_MIN_READINGS);
}

/**
 * Windows outside their hour's band, merged into episodes: consecutive
 * departing windows of one sensor (a gap of one missing window is still the
 * same episode) become one row with the start, the peak and the band at the
 * peak. Pure, so the merge is testable without a database.
 *
 * `untilMs` is the instant the day was cut at: an episode whose last window
 * touches it is still going on.
 */
export function departureEpisodes(
  windows: TenMinuteWindow[],
  usual: FleetUsual,
  untilMs: number
): DepartureEpisode[] {
  const bySensor = new Map<string, TenMinuteWindow[]>();
  for (const w of windows) {
    let list = bySensor.get(w.sensorId);
    if (!list) bySensor.set(w.sensorId, (list = []));
    list.push(w);
  }
  const out: DepartureEpisode[] = [];
  for (const [sensorId, list] of bySensor) {
    const bands = usual.get(sensorId);
    if (!bands) continue;
    list.sort((a, b) => a.tMs - b.tMs);
    let open: DepartureEpisode | null = null;
    for (const w of list) {
      const band = bands.get(athensWallTime(w.tMs).hour);
      const verdict = band ? classify(w.laeq, band) : "inside";
      const continues =
        open != null && verdict === open.verdict && w.tMs - open.endMs <= WINDOW_S * 1000;
      if (verdict === "inside" || !continues) {
        if (open) out.push(open);
        open = null;
      }
      if (verdict === "inside" || !band) continue;
      if (!open) {
        open = {
          sensorId,
          startMs: w.tMs,
          endMs: w.tMs + WINDOW_S * 1000,
          peakLaeq: w.laeq,
          peakAtMs: w.tMs,
          verdict,
          l90: band.l90,
          l50: band.l50,
          l10: band.l10,
          ongoing: false,
        };
        continue;
      }
      open.endMs = w.tMs + WINDOW_S * 1000;
      const more = verdict === "above" ? w.laeq > open.peakLaeq : w.laeq < open.peakLaeq;
      if (more) {
        open.peakLaeq = w.laeq;
        open.peakAtMs = w.tMs;
        open.l90 = band.l90;
        open.l50 = band.l50;
        open.l10 = band.l10;
      }
    }
    if (open) out.push(open);
  }
  for (const e of out) e.ongoing = e.endMs >= untilMs - WINDOW_S * 1000;
  // Newest first: what is happening now sits at the top of the rail.
  return out.sort((a, b) => b.startMs - a.startMs);
}

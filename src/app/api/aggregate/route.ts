import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { filterSql, locationSql, rangesSql } from "@/lib/server/filterSql";
import { parseWireFilters } from "@/lib/dashboard/filters";
import { BinAccumulator } from "@/lib/server/levelBins";

// Aggregates over the FILTERED time-set, per sensor: the acoustic summary
// canon — energy-mean LAeq, L50, L10 (loud tail), L90 (background floor),
// Lmax.
//
// Reads the readings_hour_bins continuous aggregate: the day/hour/month and
// range filters become predicates over the HOURLY bucket (filters are
// hour-grained by design, so this is exact), the group collapses to
// (sensor, bin), and percentiles interpolate from the bins in JS (≤0.1 dB
// vs percentile_cont — the same method as /api/series, so every view
// reports identical numbers). The energy mean and Lmax stay exact. What
// used to be a multi-second raw scan with per-sensor sorts is now a small
// rollup aggregation.

export const dynamic = "force-dynamic";

interface SensorBinRow {
  sensor_id: string;
  bin: number;
  energy: number;
  lmax: number;
  n: bigint;
}

const HOUR_MS = 3600_000;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const fromMs = Number(q.get("from"));
  if (!Number.isFinite(fromMs) || fromMs <= 0) {
    return NextResponse.json({ error: "from= requires epoch ms" }, { status: 400 });
  }

  const fromHourIso = new Date(Math.floor(fromMs / HOUR_MS) * HOUR_MS).toISOString();
  const f = parseWireFilters(q);
  const filters = filterSql(f, "rb.bucket");
  const ranges = rangesSql(f, "rb.bucket");
  const locations = locationSql(f);

  const rows = await prisma.$queryRawUnsafe<SensorBinRow[]>(`
    SELECT rb.sensor_id,
           rb.bin,
           sum(rb.energy) AS energy,
           max(rb.lmax)   AS lmax,
           sum(rb.n)::bigint AS n
    FROM readings_hour_bins rb
    JOIN sensors s ON s.id = rb.sensor_id
    WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL
      AND rb.bucket >= '${fromHourIso}'::timestamptz
      ${filters}
      ${ranges}
      ${locations}
    GROUP BY 1, 2`);

  const accs = new Map<string, BinAccumulator>();
  for (const r of rows) {
    let acc = accs.get(r.sensor_id);
    if (!acc) accs.set(r.sensor_id, (acc = new BinAccumulator()));
    acc.add(r);
  }

  const sensors: Record<string, { laeq: number; l50: number; l10: number; l90: number; lmax: number; n: number }> = {};
  for (const [id, acc] of accs) sensors[id] = acc.out();
  return NextResponse.json({ sensors });
}

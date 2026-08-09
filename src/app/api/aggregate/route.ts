import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { filterSql, locationSql, rangesSql } from "@/lib/server/filterSql";

// Aggregates over the FILTERED time-set, per sensor: the acoustic summary
// canon — energy-mean LAeq, median L50, L10 (loud tail), L90 (background
// floor), Lmax. Filters arrive as validated enum/int params and become SQL
// predicates over Athens wall time; percentiles run over per-interval LAeq
// rows (percentile_cont), the mean in the energy domain.
//
// Cost: one grouped range scan of the window (up to ~6.5M rows for 90d);
// seconds-scale worst case. Acceptable for an explicit user action now;
// the planned Timescale rollups are the real fix.

export const dynamic = "force-dynamic";

interface AggRow {
  sensor_id: string;
  laeq: number;
  l50: number;
  l10: number;
  l90: number;
  lmax: number;
  n: bigint;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const fromMs = Number(q.get("from"));
  if (!Number.isFinite(fromMs) || fromMs <= 0) {
    return NextResponse.json({ error: "from= requires epoch ms" }, { status: 400 });
  }

  const filters = filterSql(q);
  const locations = locationSql(q);
  const ranges = rangesSql(q);

  const rows = await prisma.$queryRawUnsafe<AggRow[]>(`
    SELECT r.sensor_id,
           10 * log(avg(power(10, r.laeq / 10))) AS laeq,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY r.laeq) AS l50,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY r.laeq) AS l10,
           percentile_cont(0.1) WITHIN GROUP (ORDER BY r.laeq) AS l90,
           COALESCE(max(r.lmax_est), max(r.laeq)) AS lmax,
           count(*) AS n
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL
      AND r.laeq IS NOT NULL
      AND r.recorded_at > '${new Date(fromMs).toISOString()}'::timestamp
      ${filters}
      ${locations}
      ${ranges}
    GROUP BY r.sensor_id`);

  const sensors: Record<string, { laeq: number; l50: number; l10: number; l90: number; lmax: number; n: number }> = {};
  for (const r of rows) {
    sensors[r.sensor_id] = { laeq: r.laeq, l50: r.l50, l10: r.l10, l90: r.l90, lmax: r.lmax, n: Number(r.n) };
  }
  return NextResponse.json({ sensors });
}

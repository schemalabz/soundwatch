import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Batch frame endpoint for map playback: for each requested instant, the
// energy-averaged LAeq per public sensor over a trailing window ending at
// that instant. One round trip fetches several frames, so the client can
// buffer ahead of the playhead.
//
// Query strategy: sensors × frames via LATERAL — every (sensor, frame) pair
// is one (sensor_id, recorded_at) index range probe over at most window
// seconds of rows. 50 sensors × 8 frames × ≤360 rows stays milliseconds;
// no full-table scan ever happens.

export const dynamic = "force-dynamic";

// The frame value is computed with a caller-chosen metric — the same
// acoustic summary set as /api/aggregate, applied per frame window.
const METRIC_SQL: Record<string, string> = {
  laeq: "10 * log(avg(power(10, r.laeq / 10)))",
  l50: "percentile_cont(0.5) WITHIN GROUP (ORDER BY r.laeq)",
  l10: "percentile_cont(0.9) WITHIN GROUP (ORDER BY r.laeq)",
  l90: "percentile_cont(0.1) WITHIN GROUP (ORDER BY r.laeq)",
  lmax: "COALESCE(max(r.lmax_est), max(r.laeq))",
};

const MAX_FRAMES = 16;
const MIN_WINDOW_S = 60;
const MAX_WINDOW_S = 6 * 3600;

interface FrameSqlRow {
  t: Date;
  sensor_id: string;
  laeq: number;
  n: bigint;
}

export async function GET(req: NextRequest) {
  const atParam = req.nextUrl.searchParams.get("at") ?? "";
  const windowS = Math.min(
    MAX_WINDOW_S,
    Math.max(MIN_WINDOW_S, Number(req.nextUrl.searchParams.get("window")) || 600)
  );
  const metric = req.nextUrl.searchParams.get("metric") ?? "laeq";
  const metricSql = METRIC_SQL[metric] ?? METRIC_SQL.laeq;
  const times = atParam
    .split(",")
    .map(Number)
    .filter((t) => Number.isFinite(t) && t > 0)
    .slice(0, MAX_FRAMES);
  if (times.length === 0) {
    return NextResponse.json({ error: "at= requires epoch-ms times" }, { status: 400 });
  }

  // Times travel as UTC ISO strings cast ::timestamptz. Inlined as
  // literals, NOT bind parameters: the inputs are validated numbers
  // (injection-impossible via toISOString), and the literal array lets the
  // planner pick the nested-loop index plan — the parameterized form was
  // observed to fall into a seconds-long generic plan.
  const arrayLiteral = `ARRAY[${times.map((t) => `'${new Date(t).toISOString()}'`).join(",")}]::timestamptz[]`;

  const rows = await prisma.$queryRawUnsafe<FrameSqlRow[]>(`
    SELECT f.t, s.id AS sensor_id, agg.laeq, agg.n
    FROM sensors s
    CROSS JOIN unnest(${arrayLiteral}) AS f(t)
    JOIN LATERAL (
      SELECT ${metricSql} AS laeq, count(*) AS n
      FROM readings r
      WHERE r.sensor_id = s.id
        AND r.recorded_at > f.t - make_interval(secs => ${Math.floor(windowS)})
        AND r.recorded_at <= f.t
        AND r.laeq IS NOT NULL
      HAVING count(*) > 0
    ) agg ON true
    WHERE s.is_active AND NOT s.is_experimental AND s.latitude IS NOT NULL`);

  // { [epochMs]: { [sensorId]: { laeq, n } } }
  const frames: Record<string, Record<string, { laeq: number; n: number }>> = {};
  for (const t of times) frames[String(t)] = {};
  for (const row of rows) {
    const key = String(row.t.getTime());
    if (frames[key]) frames[key][row.sensor_id] = { laeq: row.laeq, n: Number(row.n) };
  }

  return NextResponse.json({ windowS, frames });
}

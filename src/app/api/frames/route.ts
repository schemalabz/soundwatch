import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_SENSOR_SQL } from "@/lib/server/filterSql";
import { MAX_EPOCH_MS } from "@/lib/dashboard/filters";

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
  // Object.hasOwn, not `?? fallback`: ?? catches null and undefined, and an
  // INHERITED key is neither. metric=constructor resolved to the Object
  // constructor, whose source text went into the SELECT list, and Postgres
  // rejected it — a 500 on a public route. Not injectable (the text is
  // fixed), just broken.
  const metric = req.nextUrl.searchParams.get("metric") ?? "laeq";
  const metricSql = Object.hasOwn(METRIC_SQL, metric) ? METRIC_SQL[metric] : METRIC_SQL.laeq;
  const times = atParam
    .split(",")
    .map(Number)
    .filter((t) => t > 0 && t <= MAX_EPOCH_MS)
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

  // Which clock bounds the window.
  //
  // Playback asks "what did this place sound like at 03:00?" — a question
  // about when the sound happened, so it windows on recorded_at and accepts
  // the device clock's error.
  //
  // Live asks "what is it like now?", and there recorded_at is actively
  // wrong: device clocks run FORWARD up to ~35 min between NTP syncs, so a
  // drifted unit stamps its readings in the future and falls outside a window
  // ending at now — it vanishes from the map while reporting perfectly. Live
  // therefore windows on received_at, "what we have heard recently", which is
  // what live means and is immune to the drift.
  const byReceived = req.nextUrl.searchParams.get("by") === "received";
  const timeCol = byReceived ? "r.received_at" : "r.recorded_at";

  // received_at alone is not enough, for two independent reasons, and one
  // extra predicate fixes both.
  //
  // COST: `readings` is partitioned on recorded_at, so a predicate naming only
  // received_at permits no chunk exclusion — every (sensor, frame) probes
  // every chunk's index. Measured on the local stack: 294.9 ms across all
  // chunks, against 2.5 ms with the bound. The hypertable gains ~52 chunks a
  // year and 0016 deliberately sets no retention, so this only worsens. This
  // is the endpoint every open map polls every five seconds.
  //
  // CORRECTNESS: devices store-and-forward. Every replayed reading is inserted
  // with received_at = now(), so a unit reconnecting after an outage folds its
  // entire buffered backlog into the live frame — its circle showing the
  // energy mean of hours of history, and n jumping. Under recorded_at that was
  // structurally impossible.
  //
  // Bounding recorded_at to the window plus the contract's drift cap keeps the
  // genuinely-live readings (whose clocks may be up to ~35 min out) and
  // excludes the backlog (whose recorded_at is hours old).
  const DRIFT_CAP_S = 35 * 60;
  const driftBound = byReceived
    ? `AND r.recorded_at > f.t - make_interval(secs => ${Math.floor(windowS) + DRIFT_CAP_S})
        AND r.recorded_at <= f.t + make_interval(secs => ${DRIFT_CAP_S})`
    : "";

  const rows = await prisma.$queryRawUnsafe<FrameSqlRow[]>(`
    SELECT f.t, s.id AS sensor_id, agg.laeq, agg.n
    FROM sensors s
    CROSS JOIN unnest(${arrayLiteral}) AS f(t)
    JOIN LATERAL (
      SELECT ${metricSql} AS laeq, count(*) AS n
      FROM readings r
      WHERE r.sensor_id = s.id
        AND ${timeCol} > f.t - make_interval(secs => ${Math.floor(windowS)})
        AND ${timeCol} <= f.t
        ${driftBound}
        AND r.laeq IS NOT NULL
      HAVING count(*) > 0
    ) agg ON true
    WHERE ${PUBLIC_SENSOR_SQL}`);

  // { [epochMs]: { [sensorId]: { laeq, n } } }
  const frames: Record<string, Record<string, { laeq: number; n: number }>> = {};
  for (const t of times) frames[String(t)] = {};
  for (const row of rows) {
    const key = String(row.t.getTime());
    if (frames[key]) frames[key][row.sensor_id] = { laeq: row.laeq, n: Number(row.n) };
  }

  return NextResponse.json({ windowS, frames });
}

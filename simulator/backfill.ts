// Bulk-backfill readings straight into Postgres. Rows are built by running
// the simulator's own wire payloads through the REAL ingester code
// (rowBuilder.ts), so backfilled data is semantically identical to what the
// live MQTT path produces.
//
// Idempotent by design: each sensor resumes from its own max(recorded_at),
// and the insert is ON CONFLICT DO NOTHING on (sensor_id, recorded_at) — a
// re-run on a populated database only tops up the gap since the last run.
//
// Insert strategy: one INSERT ... SELECT FROM json_to_recordset($1) per
// batch — the whole batch travels as a single JSON text parameter. This
// sidesteps both the 65535-bind-parameter cap (multi-row VALUES tops out at
// ~1400 rows with this many columns) and the driver's slow per-element array
// serialization (measured 4-5x slower than JSON.stringify + server-side
// json_to_recordset for 10k-row batches).

import { PrismaClient } from "@prisma/client";
import { FLEET, phaseOffsetS } from "./fleet";
import { generateReading } from "./model";
import { buildPayload } from "./payload";
import { payloadToRow, type ReadingRow } from "./rowBuilder";
import { seedFleet } from "./seed";

const BATCH_ROWS = 10_000;
// Concurrent in-flight batch inserts. Generation is single-threaded and fast
// (~65k rows/s); a single Postgres connection inserts at ~11k rows/s, so a
// few parallel connections are needed to keep the 90-day backfill in minutes.
const INSERT_CONCURRENCY = 4;

// Column spec: SQL column name, ReadingRow field, and the unnest element type.
// Timestamps travel as UTC ISO strings cast ::timestamp — the columns are
// timestamp(3) WITHOUT time zone holding UTC wall time, and a string cast is
// immune to the session/container timezone (a Date param would not be).
type SqlType = "text" | "timestamp" | "float8" | "int4" | "jsonb";
const COLUMNS: { col: string; field: keyof ReadingRow | "sensorId"; type: SqlType }[] = [
  { col: "sensor_id", field: "sensorId", type: "text" },
  { col: "recorded_at", field: "recordedAt", type: "timestamp" },
  { col: "received_at", field: "receivedAt", type: "timestamp" },
  { col: "noise_dba", field: "noiseDba", type: "float8" },
  { col: "temperature", field: "temperature", type: "float8" },
  { col: "humidity", field: "humidity", type: "float8" },
  { col: "light_lux", field: "lightLux", type: "float8" },
  { col: "pressure_pa", field: "pressurePa", type: "float8" },
  { col: "uv_a", field: "uvA", type: "float8" },
  { col: "uv_b", field: "uvB", type: "float8" },
  { col: "uv_c", field: "uvC", type: "float8" },
  { col: "pm1", field: "pm1", type: "float8" },
  { col: "pm25", field: "pm25", type: "float8" },
  { col: "pm4", field: "pm4", type: "float8" },
  { col: "pm10", field: "pm10", type: "float8" },
  { col: "pn_05", field: "pn05", type: "float8" },
  { col: "pn_10", field: "pn10", type: "float8" },
  { col: "pn_25", field: "pn25", type: "float8" },
  { col: "pn_40", field: "pn40", type: "float8" },
  { col: "pn_100", field: "pn100", type: "float8" },
  { col: "tps", field: "tps", type: "float8" },
  { col: "battery", field: "battery", type: "float8" },
  { col: "rssi", field: "rssi", type: "float8" },
  { col: "sd_card", field: "sdCard", type: "float8" },
  { col: "payload_version", field: "payloadVersion", type: "int4" },
  { col: "energy_sum", field: "energySum", type: "float8" },
  { col: "frame_count", field: "frameCount", type: "int4" },
  { col: "interval_s", field: "intervalS", type: "int4" },
  { col: "interval_ms", field: "intervalMs", type: "int4" },
  { col: "max_energy", field: "maxEnergy", type: "float8" },
  { col: "min_energy", field: "minEnergy", type: "float8" },
  { col: "laeq", field: "laeq", type: "float8" },
  { col: "realized_duty", field: "realizedDuty", type: "float8" },
  { col: "lmax_est", field: "lmaxEst", type: "float8" },
  { col: "lmin_est", field: "lminEst", type: "float8" },
  { col: "hist_raw", field: "histRaw", type: "text" },
  { col: "bands_raw", field: "bandsRaw", type: "text" },
  { col: "l10", field: "l10", type: "float8" },
  { col: "l50", field: "l50", type: "float8" },
  { col: "l90", field: "l90", type: "float8" },
  { col: "bands_db", field: "bandsDb", type: "jsonb" },
  { col: "device_uptime_s", field: "deviceUptimeS", type: "int4" },
  { col: "free_heap_bytes", field: "freeHeapBytes", type: "int4" },
  { col: "reset_cause", field: "resetCause", type: "int4" },
  { col: "wifi_connects", field: "wifiConnects", type: "int4" },
  { col: "publish_fails", field: "publishFails", type: "int4" },
  { col: "capture_fails", field: "captureFails", type: "int4" },
  { col: "i2s_reinits", field: "i2sReinits", type: "int4" },
  { col: "ghost_refusals", field: "ghostRefusals", type: "int4" },
  { col: "soundwatch_release", field: "soundwatchRelease", type: "text" },
  { col: "sam_git_hash", field: "samGitHash", type: "text" },
  { col: "esp_git_hash", field: "espGitHash", type: "text" },
  { col: "energy_saturations", field: "energySaturations", type: "int4" },
];

const INSERT_SQL = (() => {
  const colNames = COLUMNS.map((c) => c.col).join(", ");
  const recordCols = COLUMNS.map((c) => `${c.col} ${c.type}`).join(", ");
  return (
    `INSERT INTO readings (${colNames}) ` +
    `SELECT ${colNames} FROM json_to_recordset($1::json) AS t(${recordCols}) ` +
    `ON CONFLICT (sensor_id, recorded_at) DO NOTHING`
  );
})();

function toBatchObject(sensorId: string, row: ReadingRow): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const c of COLUMNS) {
    const value = c.field === "sensorId" ? sensorId : row[c.field];
    // Dates -> UTC ISO strings; json_to_recordset casts them ::timestamp,
    // which ignores the Z and keeps UTC wall time regardless of session TZ.
    obj[c.col] = value instanceof Date ? value.toISOString() : value;
  }
  return obj;
}

async function insertBatch(prisma: PrismaClient, rows: { sensorId: string; row: ReadingRow }[]): Promise<void> {
  const payload = JSON.stringify(rows.map(({ sensorId, row }) => toBatchObject(sensorId, row)));
  await prisma.$executeRawUnsafe(INSERT_SQL, payload);
}

export async function backfill(prisma: PrismaClient): Promise<void> {
  const days = Number(process.env.SIM_BACKFILL_DAYS || 90);
  const intervalS = Number(process.env.SIM_BACKFILL_INTERVAL_S || 60);
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(intervalS) || intervalS < 1) {
    throw new Error(`Invalid SIM_BACKFILL_DAYS=${days} / SIM_BACKFILL_INTERVAL_S=${intervalS}`);
  }

  const sensorIds = await seedFleet(prisma);
  const endT = Math.floor(Date.now() / 1000);
  const horizonT = endT - days * 86400;

  let totalInserted = 0;
  const startedAt = Date.now();

  // Small pool of in-flight inserts; generation keeps running while previous
  // batches commit on other connections.
  const inflight = new Set<Promise<void>>();
  const submit = async (batch: { sensorId: string; row: ReadingRow }[]): Promise<void> => {
    while (inflight.size >= INSERT_CONCURRENCY) {
      await Promise.race(inflight);
    }
    const p = insertBatch(prisma, batch).then(() => {
      inflight.delete(p);
      totalInserted += batch.length;
    });
    inflight.add(p);
  };

  for (const sensor of FLEET) {
    const sensorId = sensorIds.get(sensor.deviceId)!;
    const phase = phaseOffsetS(sensor.deviceId, intervalS);

    // Resume from this sensor's newest reading (top-up idempotency).
    const existing = await prisma.reading.aggregate({
      where: { sensorId },
      _max: { recordedAt: true },
    });
    const resumeT = existing._max.recordedAt
      ? Math.floor(existing._max.recordedAt.getTime() / 1000) + 1
      : horizonT;
    const fromT = Math.max(horizonT, resumeT);

    // Walk the sensor's own grid: k*interval + phase.
    const k = Math.ceil((fromT - phase) / intervalS);
    let t = k * intervalS + phase;
    if (t < fromT) t += intervalS;

    const expected = t > endT ? 0 : Math.floor((endT - t) / intervalS) + 1;
    if (expected === 0) {
      console.log(`${sensor.deviceId}: up to date`);
      continue;
    }

    let generated = 0;
    let batch: { sensorId: string; row: ReadingRow }[] = [];
    for (; t <= endT; t += intervalS) {
      const sim = generateReading(sensor, t, intervalS);
      const row = payloadToRow(buildPayload(sim), sim.recordedAt);
      if (!row) throw new Error(`Simulator payload failed to parse for ${sensor.deviceId} at t=${t}`);
      batch.push({ sensorId, row });
      if (batch.length >= BATCH_ROWS) {
        await submit(batch);
        generated += BATCH_ROWS;
        batch = [];
      }
    }
    if (batch.length > 0) {
      await submit(batch);
      generated += batch.length;
    }
    const rate = Math.round(totalInserted / Math.max(1, (Date.now() - startedAt) / 1000));
    console.log(`${sensor.deviceId}: ${generated} rows queued (fleet inserted ${totalInserted}, ${rate} rows/s)`);
  }

  while (inflight.size > 0) {
    await Promise.race(inflight);
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const rate = Math.round(totalInserted / Math.max(0.001, (Date.now() - startedAt) / 1000));
  console.log(`Backfill done: ${totalInserted} rows in ${seconds}s (${rate} rows/s)`);
}

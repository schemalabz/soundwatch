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
import { isOnline } from "./outages";
import { buildPayload } from "./payload";
import { payloadToRow, type ReadingRow } from "./rowBuilder";
import { seedFleet } from "./seed";

const BATCH_ROWS = 10_000;
// Concurrent in-flight batch inserts. Generation is single-threaded and fast
// (~65k rows/s); a single Postgres connection inserts at ~11k rows/s, so a
// few parallel connections are needed to keep the 90-day backfill in minutes.
const INSERT_CONCURRENCY = 4;

// Column spec: SQL column name, ReadingRow field, and the unnest element type.
// Timestamps travel as UTC ISO strings (with Z) cast ::timestamptz — an
// absolute instant regardless of the session/container timezone.
type SqlType = "text" | "timestamptz" | "float8" | "int4" | "jsonb";
export const COLUMNS = [
  { col: "sensor_id", field: "sensorId", type: "text" },
  { col: "recorded_at", field: "recordedAt", type: "timestamptz" },
  { col: "received_at", field: "receivedAt", type: "timestamptz" },
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
] as const satisfies readonly { col: string; field: keyof ReadingRow | "sensorId"; type: SqlType }[];

// Compile-time guard: adding a field to ReadingRow (mqtt-ingester/row.ts)
// without adding it here must not compile — otherwise the backfill would
// silently insert NULL for the new column and backfill/live parity breaks.
// (backfill.test.ts additionally checks the col names against the Prisma
// schema, catching @map drift.)
type MissingColumns = Exclude<keyof ReadingRow | "sensorId", (typeof COLUMNS)[number]["field"]>;
const _allReadingRowFieldsCovered: [MissingColumns] extends [never] ? true : { missing: MissingColumns } = true;
void _allReadingRowFieldsCovered;

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
    // Dates -> UTC ISO strings; json_to_recordset casts them ::timestamptz,
    // which ignores the Z and keeps UTC wall time regardless of session TZ.
    obj[c.col] = value instanceof Date ? value.toISOString() : value;
  }
  return obj;
}

/** Returns the number of rows actually inserted (ON CONFLICT skips excluded). */
async function insertBatch(prisma: PrismaClient, rows: { sensorId: string; row: ReadingRow }[]): Promise<number> {
  const payload = JSON.stringify(rows.map(({ sensorId, row }) => toBatchObject(sensorId, row)));
  return prisma.$executeRawUnsafe(INSERT_SQL, payload);
}

export async function backfill(prisma: PrismaClient): Promise<void> {
  const days = Number(process.env.SIM_BACKFILL_DAYS || 90);
  const intervalS = Number(process.env.SIM_BACKFILL_INTERVAL_S || 60);
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(intervalS) || intervalS < 1) {
    throw new Error(`Invalid SIM_BACKFILL_DAYS=${days} / SIM_BACKFILL_INTERVAL_S=${intervalS}`);
  }

  const sensorIds = await seedFleet(prisma);

  let totalInserted = 0;
  const startedAt = Date.now();

  // Small pool of in-flight inserts; generation keeps running while previous
  // batches commit on other connections. Batches never reject unhandled: the
  // first failure is remembered and re-thrown from the coordinating side, so
  // the process dies with a clean error (not ERR_UNHANDLED_REJECTION).
  const inflight = new Set<Promise<void>>();
  let firstError: unknown = null;
  const submit = (batch: { sensorId: string; row: ReadingRow }[]): Promise<void> => {
    const p: Promise<void> = insertBatch(prisma, batch)
      .then((count) => {
        totalInserted += count;
      })
      .catch((err) => {
        firstError ??= err;
      })
      .finally(() => {
        inflight.delete(p);
      });
    inflight.add(p);
    return p;
  };
  const throttle = async (): Promise<void> => {
    while (inflight.size >= INSERT_CONCURRENCY) {
      await Promise.race(inflight);
    }
    if (firstError) throw firstError;
  };
  const drain = async (): Promise<void> => {
    await Promise.all(inflight);
    if (firstError) throw firstError;
  };

  // One pass = top up every sensor to endT, resuming from its newest reading.
  const runPass = async (endT: number, horizonT: number, quiet: boolean): Promise<void> => {
    for (const sensor of FLEET) {
      const sensorId = sensorIds.get(sensor.deviceId)!;
      const phase = phaseOffsetS(sensor.deviceId, intervalS);

      // receivedAt, not recordedAt. The grid below is TRUE time; recordedAt
      // carries each device's clock drift, so resuming from max(recordedAt)
      // starts a pass that far ahead of where it left off — a median 2101 s
      // hole across the fleet, measured. ON CONFLICT DO NOTHING on
      // (sensor_id, recorded_at) then makes the hole permanent, and the
      // catch-up loop computes zero remaining slots and reports "up to date".
      const existing = await prisma.reading.aggregate({
        where: { sensorId },
        _max: { receivedAt: true },
      });
      const resumeT = existing._max.receivedAt
        ? Math.floor(existing._max.receivedAt.getTime() / 1000) + 1
        : horizonT;
      const fromT = Math.max(horizonT, resumeT);

      // Walk the sensor's own grid: k*interval + phase (ceil lands on the
      // first grid point >= fromT).
      let t = Math.ceil((fromT - phase) / intervalS) * intervalS + phase;

      const gridSlots = t > endT ? 0 : Math.floor((endT - t) / intervalS) + 1;
      if (gridSlots === 0) {
        if (!quiet) console.log(`${sensor.deviceId}: up to date`);
        continue;
      }

      let generated = 0;
      let darkSlots = 0;
      let batch: { sensorId: string; row: ReadingRow }[] = [];
      for (; t <= endT; t += intervalS) {
        // Outage: the device was dark — no reading exists for this slot.
        if (!isOnline(sensor.deviceId, t)) {
          darkSlots++;
          continue;
        }
        const sim = generateReading(sensor, t, intervalS);
        // receivedAt is the true instant; the payload's own `t:` carries the
        // drifted device clock, exactly as a live unit would.
        const row = payloadToRow(buildPayload(sim), sim.receivedAt);
        if (!row) throw new Error(`Simulator payload failed to parse for ${sensor.deviceId} at t=${t}`);
        batch.push({ sensorId, row });
        if (batch.length >= BATCH_ROWS) {
          await throttle();
          submit(batch);
          generated += BATCH_ROWS;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await throttle();
        submit(batch);
        generated += batch.length;
      }
      if (!quiet) {
        const rate = Math.round(totalInserted / Math.max(1, (Date.now() - startedAt) / 1000));
        const darkNote = darkSlots > 0 ? `, ${((darkSlots / gridSlots) * 100).toFixed(1)}% dark` : "";
        console.log(`${sensor.deviceId}: ${generated} rows queued${darkNote} (fleet inserted ${totalInserted}, ${rate} rows/s)`);
      }
    }
    await drain();
  };

  // Main pass, then quick catch-up passes: wall time moves on while the main
  // pass runs (~minutes on a fresh database), and rows generated against the
  // original endT would otherwise leave a permanent, unrepairable gap right
  // before "now" — resume-from-max can never revisit it once live data lands.
  let endT = Math.floor(Date.now() / 1000);
  const horizonT = endT - days * 86400;
  await runPass(endT, horizonT, false);
  while (Math.floor(Date.now() / 1000) - endT >= intervalS) {
    endT = Math.floor(Date.now() / 1000);
    console.log(`Catch-up pass to t=${endT}...`);
    await runPass(endT, horizonT, true);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const rate = Math.round(totalInserted / Math.max(0.001, (Date.now() - startedAt) / 1000));
  console.log(`Backfill done: ${totalInserted} rows inserted in ${seconds}s (${rate} rows/s)`);
}

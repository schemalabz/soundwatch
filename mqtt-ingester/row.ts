// Single source of truth for turning a parsed payload into a readings row.
// Used by the live ingester (index.ts) AND the simulator's bulk backfill —
// so backfilled rows and live-ingested rows cannot drift apart.

import type { ParsedReading } from "./parser";
import { computeFlavor1 } from "./flavor1";
import { computePercentiles, decodeBandsDb } from "./flavor2";
import { decodeDiagnostics } from "./diagnostics";

/** One readings row, keyed by Prisma field names (sensorId added by caller). */
export interface ReadingRow {
  recordedAt: Date;
  receivedAt: Date;
  noiseDba: number | null;
  temperature: number | null;
  humidity: number | null;
  lightLux: number | null;
  pressurePa: number | null;
  uvA: number | null;
  uvB: number | null;
  uvC: number | null;
  pm1: number | null;
  pm25: number | null;
  pm4: number | null;
  pm10: number | null;
  pn05: number | null;
  pn10: number | null;
  pn25: number | null;
  pn40: number | null;
  pn100: number | null;
  tps: number | null;
  battery: number | null;
  rssi: number | null;
  sdCard: number | null;
  payloadVersion: number | null;
  energySum: number | null;
  frameCount: number | null;
  intervalS: number | null;
  intervalMs: number | null;
  maxEnergy: number | null;
  minEnergy: number | null;
  laeq: number | null;
  realizedDuty: number | null;
  lmaxEst: number | null;
  lminEst: number | null;
  histRaw: string | null;
  bandsRaw: string | null;
  l10: number | null;
  l50: number | null;
  l90: number | null;
  bandsDb: (number | null)[] | null;
  deviceUptimeS: number | null;
  freeHeapBytes: number | null;
  resetCause: number | null;
  wifiConnects: number | null;
  publishFails: number | null;
  captureFails: number | null;
  i2sReinits: number | null;
  ghostRefusals: number | null;
  soundwatchRelease: string | null;
  samGitHash: string | null;
  espGitHash: string | null;
  energySaturations: number | null;
}

/** Parse-time metrics -> full column set: interval normalization + all math. */
export function deriveReadingRow(reading: ParsedReading, receivedAt: Date): ReadingRow {
  // Payload v3 (id 235 >= 3): id 238 carries MILLISECONDS; v2 carried whole
  // seconds. Normalize once here so everything downstream is exact.
  const intervalMs =
    reading.intervalS == null
      ? null
      : (reading.payloadVersion ?? 2) >= 3
        ? reading.intervalS
        : reading.intervalS * 1000;
  // Flavor 1 (Step 4): turn raw accumulators into LAeq / realized_duty / Lmax-Lmin.
  const f1 = computeFlavor1({ ...reading, intervalMs });
  // Flavor 2: percentiles from the level histogram + band dB from the packed spectrum.
  const pct = reading.histRaw ? computePercentiles(reading.histRaw) : null;
  const bandsDb = reading.bandsRaw ? decodeBandsDb(reading.bandsRaw) : null;
  // Device health telemetry (id 243) — uptime, heap, reset cause, churn counters.
  const diag = decodeDiagnostics(reading.diagRaw);

  return {
    recordedAt: reading.recordedAt, // device clock (when the sound happened)
    receivedAt, // server clock (when we persisted it)
    noiseDba: reading.noiseDba,
    temperature: reading.temperature,
    humidity: reading.humidity,
    lightLux: reading.lightLux,
    pressurePa: reading.pressurePa,
    uvA: reading.uvA,
    uvB: reading.uvB,
    uvC: reading.uvC,
    pm1: reading.pm1,
    pm25: reading.pm25,
    pm4: reading.pm4,
    pm10: reading.pm10,
    pn05: reading.pn05,
    pn10: reading.pn10,
    pn25: reading.pn25,
    pn40: reading.pn40,
    pn100: reading.pn100,
    tps: reading.tps,
    battery: reading.battery,
    rssi: reading.rssi,
    sdCard: reading.sdCard,
    payloadVersion: reading.payloadVersion,
    energySum: reading.energySum,
    frameCount: reading.frameCount,
    intervalS: intervalMs != null ? Math.round(intervalMs / 1000) : reading.intervalS,
    intervalMs,
    maxEnergy: reading.maxEnergy,
    minEnergy: reading.minEnergy,
    laeq: f1?.laeq ?? null,
    realizedDuty: f1?.realizedDuty ?? null,
    lmaxEst: f1?.lmaxEst ?? null,
    lminEst: f1?.lminEst ?? null,
    histRaw: reading.histRaw,
    bandsRaw: reading.bandsRaw,
    l10: pct?.l10 ?? null,
    l50: pct?.l50 ?? null,
    l90: pct?.l90 ?? null,
    bandsDb,
    deviceUptimeS: diag?.deviceUptimeS ?? null,
    freeHeapBytes: diag?.freeHeapBytes ?? null,
    resetCause: diag?.resetCause ?? null,
    wifiConnects: diag?.wifiConnects ?? null,
    publishFails: diag?.publishFails ?? null,
    captureFails: diag?.captureFails ?? null,
    i2sReinits: diag?.i2sReinits ?? null,
    ghostRefusals: diag?.ghostRefusals ?? null,
    soundwatchRelease: diag?.soundwatchRelease ?? null,
    samGitHash: diag?.samGitHash ?? null,
    espGitHash: diag?.espGitHash ?? null,
    energySaturations: diag?.energySaturations ?? null,
  };
}

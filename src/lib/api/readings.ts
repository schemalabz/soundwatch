import type { Prisma } from "@prisma/client";
import { HIST_BINS, parseCounts } from "../../../mqtt-ingester/flavor2";
import type { ApiReading } from "./schemas";

// Bin 29 of the level histogram is open-ended [88, ∞) device-dB and bin 0 is
// open-ended below 32, so a percentile landing there is a bound, not a value.
// These flags are what let a client render "≥ 88" instead of a confident wrong
// number. Semantics: soundwatch-firmware/docs/soundwatch/measurement-contract.md
export interface HistCensoring {
  topBinCensored: boolean;
  bottomBinCensored: boolean;
}

export function parseHist(histRaw: string | null): number[] | null {
  if (histRaw == null) return null;
  const counts = parseCounts(histRaw);
  return counts && counts.length === HIST_BINS ? counts : null;
}

export function deriveCensoring(histRaw: string | null): HistCensoring | null {
  const counts = parseHist(histRaw);
  if (!counts) return null;
  return {
    topBinCensored: counts[HIST_BINS - 1] > 0,
    bottomBinCensored: counts[0] > 0,
  };
}

// The one select used by every public route that returns readings — the API
// surface is defined once, here and in ReadingSchema, not per-route.
export const READING_SELECT = {
  recordedAt: true,
  receivedAt: true,
  noiseDba: true,
  laeq: true,
  l10: true,
  l50: true,
  l90: true,
  lmaxEst: true,
  lminEst: true,
  histRaw: true,
  bandsDb: true,
  realizedDuty: true,
  frameCount: true,
  intervalMs: true,
  intervalS: true,
  payloadVersion: true,
  energySaturations: true,
  temperature: true,
  humidity: true,
  lightLux: true,
  pressurePa: true,
  uvA: true,
  uvB: true,
  uvC: true,
  pm1: true,
  pm25: true,
  pm4: true,
  pm10: true,
  pn05: true,
  pn10: true,
  pn25: true,
  pn40: true,
  pn100: true,
  tps: true,
  battery: true,
  rssi: true,
  sdCard: true,
} as const satisfies Prisma.ReadingSelect;

export type ReadingRow = Prisma.ReadingGetPayload<{ select: typeof READING_SELECT }>;

// camelCase field -> snake_case column, for the routes that read readings over
// raw SQL rather than through Prisma. `satisfies Record<keyof ReadingRow, string>`
// is a compile-time exhaustiveness check: if READING_SELECT gains a field, this
// stops compiling rather than silently dropping it from the API. `as const` keeps
// the column names as literal types, which is what lets contract.ts compare them
// against the simulator's write map.
export const READING_COLUMNS = {
  recordedAt: "recorded_at",
  receivedAt: "received_at",
  noiseDba: "noise_dba",
  laeq: "laeq",
  l10: "l10",
  l50: "l50",
  l90: "l90",
  lmaxEst: "lmax_est",
  lminEst: "lmin_est",
  histRaw: "hist_raw",
  bandsDb: "bands_db",
  realizedDuty: "realized_duty",
  frameCount: "frame_count",
  intervalMs: "interval_ms",
  intervalS: "interval_s",
  payloadVersion: "payload_version",
  energySaturations: "energy_saturations",
  temperature: "temperature",
  humidity: "humidity",
  lightLux: "light_lux",
  pressurePa: "pressure_pa",
  uvA: "uv_a",
  uvB: "uv_b",
  uvC: "uv_c",
  pm1: "pm1",
  pm25: "pm25",
  pm4: "pm4",
  pm10: "pm10",
  pn05: "pn_05",
  pn10: "pn_10",
  pn25: "pn_25",
  pn40: "pn_40",
  pn100: "pn_100",
  tps: "tps",
  battery: "battery",
  rssi: "rssi",
  sdCard: "sd_card",
} as const satisfies Record<keyof ReadingRow, string>;

/**
 * bands_db is a Json column, so Prisma types it as the full JsonValue union.
 * The ingester only ever writes (number | null)[] — decodeBandsDb in
 * mqtt-ingester/flavor2.ts, where null means "no energy recorded" for that
 * band. This is the single place that narrowing happens.
 */
export function toBandsDb(value: ReadingRow["bandsDb"]): (number | null)[] | null {
  return (value as (number | null)[] | null) ?? null;
}

export function serializeReading(r: ReadingRow): ApiReading {
  const censoring = deriveCensoring(r.histRaw);
  return {
    recordedAt: r.recordedAt.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    laeq: r.laeq,
    l10: r.l10,
    l50: r.l50,
    l90: r.l90,
    topBinCensored: censoring?.topBinCensored ?? null,
    bottomBinCensored: censoring?.bottomBinCensored ?? null,
    lmaxEst: r.lmaxEst,
    lminEst: r.lminEst,
    hist: parseHist(r.histRaw),
    bandsDb: toBandsDb(r.bandsDb),
    realizedDuty: r.realizedDuty,
    frameCount: r.frameCount,
    intervalMs: r.intervalMs,
    intervalS: r.intervalS,
    payloadVersion: r.payloadVersion,
    energySaturations: r.energySaturations,
    // Soundwatch firmware ships stock noise_dba (id 53) disabled; laeq under
    // the old key keeps existing consumers alive. Deprecated in the schema.
    noiseDba: r.noiseDba ?? r.laeq,
    temperature: r.temperature,
    humidity: r.humidity,
    lightLux: r.lightLux,
    pressurePa: r.pressurePa,
    uvA: r.uvA,
    uvB: r.uvB,
    uvC: r.uvC,
    pm1: r.pm1,
    pm25: r.pm25,
    pm4: r.pm4,
    pm10: r.pm10,
    pn05: r.pn05,
    pn10: r.pn10,
    pn25: r.pn25,
    pn40: r.pn40,
    pn100: r.pn100,
    tps: r.tps,
    battery: r.battery,
    rssi: r.rssi,
    sdCard: r.sdCard,
  };
}

// Deterministic reading generator. Everything is a pure function of
// (sensor, epochSeconds, intervalS, seed): the backfill and the live streamer
// call the same code at different times and MUST produce one continuous,
// seamless series — so there is no mutable state, no Math.random, and no
// dependence on wall-clock "now".
//
// Realism goals (a filtering UI is built on this data, so weekend/night/
// neighborhood contrasts must be visible):
//   - per-sensor base level + archetype diurnal curve + weekday/weekend shape
//   - smooth autocorrelated wander (value noise), not white noise
//   - sporadic loud events that fatten the histogram tail (sirens, trucks)
//   - all derived quantities (energySum, histogram, percentiles) generated
//     self-consistently, so the REAL ingester math recovers laeq ≈ target.

import { FRAMES_PER_SEC_REALTIME } from "../mqtt-ingester/flavor1";
import { HIST_BINS, HIST_BIN_DB, HIST_MIN_DB, BAND_LABELS } from "../mqtt-ingester/flavor2";
import type { Archetype, FleetSensor } from "./fleet";
import { rand01, valueNoise } from "./random";
import { lastOutageEndBefore } from "./outages";

// ---------------------------------------------------------------------------
// Local time (Athens ≈ UTC+3; fixed offset, no DST — a documented
// approximation that only shifts winter curves by one cosmetic hour).

const LOCAL_OFFSET_S = 3 * 3600;

interface LocalTime {
  hour: number; // fractional local hour [0, 24)
  dow: number; // 0 = Sunday ... 6 = Saturday, local
}

export function localTime(tSec: number): LocalTime {
  const local = tSec + LOCAL_OFFSET_S;
  const day = Math.floor(local / 86400);
  const hour = (local - day * 86400) / 3600;
  const dow = (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  return { hour, dow };
}

// ---------------------------------------------------------------------------
// Diurnal shape: 24-entry dB-offset tables (index = local hour), linearly
// interpolated so the curve is smooth. Values are offsets from baseDb.

const DIURNAL: Record<Archetype, { weekday: number[]; weekend: number[] }> = {
  residential: {
    weekday: [-6, -8, -9, -10, -10, -8, -5, -2, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, -2, -5],
    weekend: [-4, -6, -8, -10, -10, -9, -8, -6, -3, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, -1, -3],
  },
  commercial: {
    weekday: [-8, -8, -8, -8, -8, -7, -4, -1, 2, 3, 4, 4, 4, 3, 3, 3, 4, 4, 4, 3, 1, -1, -4, -6],
    weekend: [-7, -7, -8, -8, -8, -7, -5, -3, 0, 2, 3, 4, 4, 3, 2, 2, 3, 3, 3, 2, 0, -2, -4, -6],
  },
  nightlife: {
    weekday: [3, 0, -3, -5, -6, -6, -5, -3, -1, 0, 1, 2, 2, 2, 2, 2, 3, 3, 4, 5, 6, 6, 6, 5],
    weekend: [7, 5, 1, -3, -5, -6, -5, -4, -2, -1, 0, 1, 2, 2, 2, 3, 3, 4, 5, 6, 7, 8, 8, 8],
  },
  arterial: {
    weekday: [-5, -6, -7, -7, -6, -4, 0, 4, 5, 3, 2, 2, 2, 2, 2, 2, 3, 5, 5, 4, 2, 0, -2, -4],
    weekend: [-3, -5, -6, -6, -6, -5, -3, -1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, -1, -2],
  },
};

/**
 * Weekend-shaped days: Sat/Sun, but for nightlife the "weekend night" starts
 * Friday evening (Fri 18:00 onward uses the weekend curve — Friday night IS
 * the going-out night) and Sunday evening reverts to the weekday shape.
 */
function usesWeekendCurve(archetype: Archetype, lt: LocalTime): boolean {
  if (archetype === "nightlife") {
    if (lt.dow === 5 && lt.hour >= 18) return true; // Friday evening
    if (lt.dow === 6) return true; // Saturday (incl. Fri-night spillover 0-6h)
    if (lt.dow === 0) return lt.hour < 18; // Sunday until evening
    return false;
  }
  return lt.dow === 0 || lt.dow === 6;
}

export function diurnalOffsetDb(archetype: Archetype, lt: LocalTime): number {
  const table = usesWeekendCurve(archetype, lt) ? DIURNAL[archetype].weekend : DIURNAL[archetype].weekday;
  const h0 = Math.floor(lt.hour) % 24;
  const h1 = (h0 + 1) % 24;
  const f = lt.hour - Math.floor(lt.hour);
  let db = table[h0] + (table[h1] - table[h0]) * f;
  if (archetype === "commercial" && lt.dow === 0) db -= 5; // Sunday closing laws
  return db;
}

// ---------------------------------------------------------------------------
// Events: short loud incidents (siren, garbage truck, street work). Decided
// per interval from a hash, so backfill and live agree wherever intervals
// align, and every interval is independently reproducible.

export interface SimEvent {
  /** Peak level of the event in device-dB. */
  levelDb: number;
  /** Fraction of the interval's frames at the event level (0.02-0.05). */
  frameFraction: number;
  /** Siren-flavored events also lift the 1-2 kHz bands. */
  siren: boolean;
}

function eventRate(archetype: Archetype, lt: LocalTime): number {
  const day = lt.hour >= 7 && lt.hour < 21;
  switch (archetype) {
    case "nightlife":
      if ((lt.dow === 5 || lt.dow === 6) && (lt.hour >= 22 || lt.hour < 2)) return 0.06;
      return day ? 0.03 : 0.02;
    case "arterial":
      return day ? 0.04 : 0.01;
    case "commercial":
      return day ? 0.03 : 0.005;
    case "residential":
      return day ? 0.02 : 0.005;
  }
}

function maybeEvent(sensor: FleetSensor, lt: LocalTime, intervalIndex: number, targetDb: number): SimEvent | null {
  const roll = rand01(sensor.deviceId, "event", intervalIndex);
  if (roll >= eventRate(sensor.archetype, lt)) return null;
  const r1 = rand01(sensor.deviceId, "event-level", intervalIndex);
  const r2 = rand01(sensor.deviceId, "event-mass", intervalIndex);
  return {
    levelDb: Math.min(92, targetDb + 12 + 8 * r1),
    frameFraction: 0.02 + 0.03 * r2,
    siren: rand01(sensor.deviceId, "event-kind", intervalIndex) < 0.4,
  };
}

// ---------------------------------------------------------------------------
// Normal CDF (Abramowitz & Stegun 7.1.26) for the analytic frame-level
// histogram — no per-frame sampling, so backfill generation stays fast.

function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// ---------------------------------------------------------------------------
// The generated reading

export interface SimReading {
  recordedAt: Date;
  intervalMs: number;
  /** What the model aimed for, before events; tests compare against this. */
  targetLaeq: number;
  event: SimEvent | null;
  // Flavor 1 accumulators (integers, as the device would send)
  energySum: number;
  frameCount: number;
  maxEnergy: number;
  minEnergy: number;
  /** 30 histogram bin counts, sum == frameCount. */
  histCounts: number[];
  /** 21 band levels as dB*10 ints, or null on intervals where 242 is skipped. */
  bandsDb10: number[] | null;
  /** Packed id-243 string, or null on intervals where 243 is skipped. */
  diagString: string | null;
  // Environment (wire units: pressure in kPa, everything else as stored)
  temperature: number;
  humidity: number;
  pressureKpa: number;
  battery: number;
  rssi: number;
  sdCard: number;
  uvA: number;
  uvB: number;
  uvC: number;
  /** Light publishes every 3rd interval (bench-observed cadence). */
  lightLux: number | null;
  /** Particulates publish in ~10% of intervals (bench-observed). */
  pm: { pm1: number; pm25: number; pm4: number; pm10: number; pn05: number; pn10: number; pn25: number; pn40: number; pn100: number; tps: number } | null;
}

/** Daylight factor [0,1]: 0 at night, ~1 midday (approx. 06:30-20:30 sun). */
function daylight(lt: LocalTime): number {
  const x = (lt.hour - 6.5) / 14; // 06:30 -> 0, 20:30 -> 1
  if (x <= 0 || x >= 1) return 0;
  return Math.sin(Math.PI * x);
}

/** The model's headline output: target LAeq (pre-event) at time t. */
export function targetLevelDb(sensor: FleetSensor, tSec: number): number {
  const lt = localTime(tSec);
  const spanScale = sensor.baseSpanDb / 18; // wander scales with site volatility
  const wander =
    2.5 * spanScale * valueNoise(sensor.deviceId, "w-slow", tSec, 1800) +
    1.2 * spanScale * valueNoise(sensor.deviceId, "w-fast", tSec, 300);
  const level = sensor.baseDb + diurnalOffsetDb(sensor.archetype, lt) + wander;
  return Math.min(95, Math.max(35, level));
}

/**
 * Generate the full reading for the interval ENDING at tSec.
 * Deterministic: same (sensor, tSec, intervalS, SIM_SEED) -> same reading.
 */
export function generateReading(sensor: FleetSensor, tSec: number, intervalS: number): SimReading {
  const t = Math.floor(tSec);
  const lt = localTime(t);
  const intervalIndex = Math.floor(t / intervalS);
  const L = targetLevelDb(sensor, t);
  let event = maybeEvent(sensor, lt, intervalIndex, L);

  // --- frame-level histogram (the source of truth for all noise numbers) ---
  const duty = 0.1 + 0.075 * (valueNoise(sensor.deviceId, "duty", t, 7200) + 1); // 0.10-0.25
  const frameCount = Math.max(1, Math.round(FRAMES_PER_SEC_REALTIME * intervalS * duty));

  const sigma = sensor.archetype === "arterial" ? 6 : 4;
  // Energy-domain mean of a normal dB distribution exceeds mu by
  // ln(10)/20 * sigma^2 ≈ 0.0576*sigma^2; compensate so the ingester's
  // 10*log10(energySum/frameCount) lands on the target L.
  const mu = L - 0.057565 * sigma * sigma;

  let baseFrames = event ? Math.round(frameCount * (1 - event.frameFraction)) : frameCount;
  // At very short intervals the event mass can round to zero frames; treat
  // that as no event, or lmaxEst would claim a peak the histogram/energy
  // never contained.
  if (event && frameCount - baseFrames <= 0) {
    event = null;
    baseFrames = frameCount;
  }
  const eventFrames = frameCount - baseFrames;

  const probs: number[] = new Array(HIST_BINS);
  for (let i = 0; i < HIST_BINS; i++) {
    const lo = HIST_MIN_DB + i * HIST_BIN_DB;
    const hi = lo + HIST_BIN_DB;
    let p = normCdf((hi - mu) / sigma) - normCdf((lo - mu) / sigma);
    if (i === 0) p += normCdf((lo - mu) / sigma); // clamp the tails into the
    if (i === HIST_BINS - 1) p += 1 - normCdf((hi - mu) / sigma); // edge bins
    probs[i] = p;
  }
  // Integerize to exactly baseFrames (largest-remainder rounding).
  const counts = new Array<number>(HIST_BINS).fill(0);
  let assigned = 0;
  const remainders: { i: number; frac: number }[] = [];
  for (let i = 0; i < HIST_BINS; i++) {
    const exact = probs[i] * baseFrames;
    counts[i] = Math.floor(exact);
    assigned += counts[i];
    remainders.push({ i, frac: exact - counts[i] });
  }
  remainders.sort((a, b) => b.frac - a.frac);
  for (let k = 0; assigned < baseFrames && k < remainders.length; k++, assigned++) {
    counts[remainders[k].i]++;
  }
  if (event && eventFrames > 0) {
    const bin = Math.min(HIST_BINS - 1, Math.max(0, Math.floor((event.levelDb - HIST_MIN_DB) / HIST_BIN_DB)));
    counts[bin] += eventFrames;
  }

  // --- accumulators ---
  // The real firmware computes energy_sum from RAW frame energies while the
  // histogram quantizes to 2 dB bins, so energy_sum is exact and the histogram
  // approximate — mirror that: derive energySum from the target level (plus
  // event energy) so the ingester's 10*log10(energySum/frameCount) recovers
  // the target exactly, and let the histogram carry the (quantized) shape.
  let energySum = baseFrames * Math.pow(10, L / 10);
  if (event && eventFrames > 0) {
    energySum += eventFrames * Math.pow(10, event.levelDb / 10);
  }
  energySum = Math.max(1, Math.round(energySum));
  let topBin = -1;
  let bottomBin = -1;
  for (let i = 0; i < HIST_BINS; i++) {
    if (counts[i] === 0) continue;
    if (bottomBin < 0) bottomBin = i;
    topBin = i;
  }
  const maxDb = event ? event.levelDb : HIST_MIN_DB + (topBin + 1) * HIST_BIN_DB;
  const minDb = HIST_MIN_DB + bottomBin * HIST_BIN_DB;
  const maxEnergy = Math.max(1, Math.round(Math.pow(10, maxDb / 10)));
  const minEnergy = Math.max(1, Math.round(Math.pow(10, minDb / 10)));

  // --- bands: traffic-ish spectrum rolling off toward high frequencies ---
  // 242 and 243 alternate across intervals (NETBUFF budget, like a real
  // duty-cycled device would).
  const sendBands = intervalIndex % 2 === 0;
  let bandsDb10: number[] | null = null;
  if (sendBands) {
    bandsDb10 = BAND_LABELS.map((_, k) => {
      const rolloff = -2 - (23 * k) / (BAND_LABELS.length - 1); // -2 .. -25 dB
      let db = L + rolloff + 1.5 * valueNoise(sensor.deviceId, `band-${k}`, t, 900);
      if (event?.siren && k >= 7 && k <= 10) db += 6; // 1-2 kHz slots
      return Math.max(1, Math.round(db * 10));
    });
  }

  // --- diagnostics: reboot every 3-10 days, believable counters. A unit
  // that just recovered from an outage reports uptime since power-back, not
  // since its scheduled reboot — outages ARE reboots. ---
  const sendDiag = !sendBands;
  let diagString: string | null = null;
  if (sendDiag) {
    const bootPeriodS = Math.round((3 + 7 * rand01(sensor.deviceId, "boot", 0)) * 86400);
    const scheduledBootT = t - (t % bootPeriodS);
    const outageEndT = lastOutageEndBefore(sensor.deviceId, t);
    const uptimeS = t - Math.max(scheduledBootT, outageEndT ?? 0);
    const freeHeap = 7000 + Math.round(2000 * rand01(sensor.deviceId, "heap", Math.floor(t / bootPeriodS)));
    const wifiConnects = 1 + Math.floor(uptimeS / 43200);
    const publishFails = Math.floor(uptimeS / 86400);
    const captureFails = Math.floor(uptimeS / 7200) % 60;
    const i2sReinits = Math.floor(uptimeS / 14400);
    diagString = [uptimeS, freeHeap, 64, wifiConnects, publishFails, captureFails, i2sReinits, 0, "1.0", "3e69ded", "3e69ded", 0].join("-");
  }

  // --- environment ---
  const day = daylight(lt);
  const temperature = round1(31 + 2 * Math.sin(((lt.hour - 9) / 24) * 2 * Math.PI) + valueNoise(sensor.deviceId, "temp", t, 21600));
  const humidity = round1(39.5 - 1.5 * (temperature - 31) + valueNoise(sensor.deviceId, "hum", t, 21600));
  const pressureKpa = round2(100.25 + 0.1 * valueNoise(sensor.deviceId, "press", t, 21600));
  const battery = Math.round(97.5 + 1.5 * valueNoise(sensor.deviceId, "batt", t, 86400));
  const rssi = Math.round(-57 + 6 * valueNoise(sensor.deviceId, "rssi", t, 1800));
  const uvA = round2(0.15 * day + 0.02 * (valueNoise(sensor.deviceId, "uv", t, 3600) + 1));
  const uvB = round2(uvA / 10);
  const uvC = round2(uvA / 15);
  const lightLux =
    intervalIndex % 3 === 0
      ? Math.round(day * (200 + 644 * ((valueNoise(sensor.deviceId, "light", t, 3600) + 1) / 2)))
      : null;

  let pm: SimReading["pm"] = null;
  if (rand01(sensor.deviceId, "pm", intervalIndex) < 0.1) {
    const pm25 = round1(3 + 6 * rand01(sensor.deviceId, "pm25", intervalIndex));
    pm = {
      pm1: round1(pm25 * 0.7),
      pm25,
      pm4: round1(pm25 * 1.05),
      pm10: round1(pm25 * 1.15),
      pn05: Math.round(pm25 * 550),
      pn10: Math.round(pm25 * 640),
      pn25: Math.round(pm25 * 650),
      pn40: Math.round(pm25 * 652),
      pn100: Math.round(pm25 * 653),
      tps: round2(0.3 + 0.3 * rand01(sensor.deviceId, "tps", intervalIndex)),
    };
  }

  return {
    recordedAt: new Date(t * 1000),
    intervalMs: intervalS * 1000,
    targetLaeq: L,
    event,
    energySum,
    frameCount,
    maxEnergy,
    minEnergy,
    histCounts: counts,
    bandsDb10,
    diagString,
    temperature,
    humidity,
    pressureKpa,
    battery,
    rssi,
    sdCard: 1,
    uvA,
    uvB,
    uvC,
    lightLux,
    pm,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

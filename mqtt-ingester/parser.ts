import { STOCK_SENSOR_ID_MAP, STOCK_UNIT_CONVERSIONS } from "@/types/sensor";

export interface ParsedReading {
  recordedAt: Date;
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
  // Flavor 1 (Step 4) continuous-LAeq accumulators (ids 235-240). Present only
  // on Flavor 1 firmware; null otherwise. The server computes LAeq/duty/Lmax/Lmin
  // from these (see flavor1.ts).
  payloadVersion: number | null;
  energySum: number | null;
  // Flavor 2 packed spectrum strings (ids 241/242) — decoded in flavor2.ts.
  histRaw: string | null;
  bandsRaw: string | null;
  frameCount: number | null;
  intervalS: number | null;
  maxEnergy: number | null;
  minEnergy: number | null;
}

type Metrics = Omit<ParsedReading, "recordedAt">;

// Stock firmware topic: device/sck/<token>/readings/raw  (token = device id)
const TOPIC_REGEX = /^device\/sck\/([^/]+)\/readings\/raw$/;

// Flavor 1 accumulator ids -> ParsedReading fields (stored raw; math in flavor1.ts).
const FLAVOR1_ID_MAP: Record<number, keyof Metrics> = {
  235: "payloadVersion",
  236: "energySum",
  237: "frameCount",
  238: "intervalS",
  239: "maxEnergy",
  240: "minEnergy",
};

export function extractDeviceId(topic: string): string | null {
  const match = topic.match(TOPIC_REGEX);
  return match ? match[1] : null;
}

function emptyMetrics(): Metrics {
  return {
    noiseDba: null,
    temperature: null,
    humidity: null,
    lightLux: null,
    pressurePa: null,
    uvA: null,
    uvB: null,
    uvC: null,
    pm1: null,
    pm25: null,
    pm4: null,
    pm10: null,
    pn05: null,
    pn10: null,
    pn25: null,
    pn40: null,
    pn100: null,
    tps: null,
    battery: null,
    rssi: null,
    sdCard: null,
    payloadVersion: null,
    energySum: null,
    histRaw: null,
    bandsRaw: null,
    frameCount: null,
    intervalS: null,
    maxEnergy: null,
    minEnergy: null,
  };
}

/**
 * Parse the stock SmartCitizen readings payload, which is NOT JSON:
 *   {t:<iso8601>,<numeric-id>:<value>,...}
 * Keys and the ISO timestamp value are unquoted; the timestamp itself
 * contains ':' so we split each token on its FIRST colon only.
 * Numeric ids are mapped to typed columns via STOCK_SENSOR_ID_MAP.
 */
export function parseSensorPayload(raw: string): ParsedReading | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  const body = trimmed.slice(1, -1).trim();
  if (body.length === 0) return null;

  const metrics = emptyMetrics();
  let recordedAt: Date | null = null;

  for (const token of body.split(",")) {
    const sep = token.indexOf(":");
    if (sep < 0) continue;

    const key = token.slice(0, sep).trim();
    const valueStr = token.slice(sep + 1).trim();

    if (key === "t") {
      const date = new Date(valueStr);
      if (isNaN(date.getTime())) return null;
      recordedAt = date;
      continue;
    }

    const id = Number(key);
    if (!Number.isInteger(id)) continue;

    // Flavor 2 packed values (dash-separated arrays) stay raw strings.
    if (id === 241) { metrics.histRaw = valueStr; continue; }
    if (id === 242) { metrics.bandsRaw = valueStr; continue; }

    // Reject blank values: Number("") is 0, which would masquerade as a real
    // reading and pollute averages/thresholds. A missing value stays null.
    if (valueStr.length === 0) continue;
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    const stockField = STOCK_SENSOR_ID_MAP[id];
    if (stockField) {
      const convert = STOCK_UNIT_CONVERSIONS[stockField];
      (metrics as Record<string, number | null>)[stockField] = convert
        ? convert(value)
        : value;
      continue;
    }

    const f1Field = FLAVOR1_ID_MAP[id];
    if (f1Field) {
      (metrics as Record<string, number | null>)[f1Field] = value;
      continue;
    }
    // unknown id: ignore
  }

  if (!recordedAt) return null;

  return { recordedAt, ...metrics };
}

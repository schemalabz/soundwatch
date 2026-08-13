export interface SensorReading {
  id: string;
  value: number;
}

export interface SensorPayload {
  device_id: string;
  recorded_at: string;
  sensors: SensorReading[];
}

export const SENSOR_FIELD_MAP: Record<string, string> = {
  noise_dba: "noiseDba",
  temperature: "temperature",
  humidity: "humidity",
  light_lux: "lightLux",
  pressure_pa: "pressurePa",
  uv_a: "uvA",
  uv_b: "uvB",
  uv_c: "uvC",
  pm1: "pm1",
  pm25: "pm25",
  pm4: "pm4",
  pm10: "pm10",
  pn05: "pn05",
  pn10: "pn10",
  pn25: "pn25",
  pn40: "pn40",
  pn100: "pn100",
  tps: "tps",
  battery: "battery",
  rssi: "rssi",
  sd_card: "sdCard",
} as const;

export type SensorField = keyof typeof SENSOR_FIELD_MAP;

// Stock SmartCitizen firmware publishes readings keyed by NUMERIC metric id
// (topic `device/sck/<token>/readings/raw`, payload `{t,<id>:value}`).
// This maps those ids -> our ParsedReading/Prisma field names.
// NOTE: this map predates
// this one — candidate for future de-duplication onto this shared definition.
export const STOCK_SENSOR_ID_MAP: Record<number, string> = {
  53: "noiseDba", // stock "Noise Level"; the vendor's unit claim, unvalidated
  55: "temperature", // Temperature (°C)
  56: "humidity", // Humidity (%)
  14: "lightLux", // Light (lux)
  58: "pressurePa", // Barometric Pressure (kPa -> Pa, see conversions)
  214: "uvA",
  215: "uvB",
  216: "uvC",
  193: "pm1",
  194: "pm25",
  195: "pm4",
  196: "pm10",
  197: "pn05",
  198: "pn10",
  199: "pn25",
  200: "pn40",
  201: "pn100",
  202: "tps", // Typical Particle Size (µm)
  10: "battery", // Battery (%)
  220: "rssi", // WiFi RSSI (dBm)
  221: "sdCard", // SD card presence
};

// Field-specific unit conversions applied to the raw stock value.
export const STOCK_UNIT_CONVERSIONS: Record<string, (v: number) => number> = {
  pressurePa: (kpa) => kpa * 1000, // stock emits kPa; the column is Pa
};

export const NOISE_THRESHOLDS = {
  quiet: 55,
  moderate: 65,
  loud: 75,
} as const;

export type NoiseLevel = "quiet" | "moderate" | "loud" | "very_loud";

export function getNoiseLevel(dba: number): NoiseLevel {
  if (dba < NOISE_THRESHOLDS.quiet) return "quiet";
  if (dba < NOISE_THRESHOLDS.moderate) return "moderate";
  if (dba < NOISE_THRESHOLDS.loud) return "loud";
  return "very_loud";
}

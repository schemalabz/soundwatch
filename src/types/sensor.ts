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

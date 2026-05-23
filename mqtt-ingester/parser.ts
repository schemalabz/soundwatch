import { SENSOR_FIELD_MAP } from "@/types/sensor";

export interface ParsedReading {
  deviceId: string;
  firmwareVersion?: string;
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
}

const TOPIC_REGEX = /^soundwatch\/sensors\/([^/]+)\/readings$/;

export function extractDeviceId(topic: string): string | null {
  const match = topic.match(TOPIC_REGEX);
  return match ? match[1] : null;
}

export function parseSensorPayload(raw: string): ParsedReading | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("device_id" in data) ||
    !("recorded_at" in data) ||
    !("sensors" in data)
  ) {
    return null;
  }

  const obj = data as {
    device_id: unknown;
    recorded_at: unknown;
    sensors: unknown;
  };

  if (typeof obj.device_id !== "string" || typeof obj.recorded_at !== "string") {
    return null;
  }

  if (!Array.isArray(obj.sensors) || obj.sensors.length === 0) {
    return null;
  }

  const firmwareVersion =
    "firmware_version" in (data as Record<string, unknown>) &&
    typeof (data as Record<string, unknown>).firmware_version === "string"
      ? ((data as Record<string, unknown>).firmware_version as string)
      : undefined;

  const reading: ParsedReading = {
    deviceId: obj.device_id,
    firmwareVersion,
    recordedAt: new Date(obj.recorded_at),
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
  };

  for (const sensor of obj.sensors) {
    if (
      typeof sensor !== "object" ||
      sensor === null ||
      typeof sensor.id !== "string" ||
      typeof sensor.value !== "number"
    ) {
      continue;
    }

    const fieldName = SENSOR_FIELD_MAP[sensor.id];
    if (fieldName && fieldName in reading) {
      (reading as unknown as Record<string, unknown>)[fieldName] = sensor.value;
    }
  }

  return reading;
}

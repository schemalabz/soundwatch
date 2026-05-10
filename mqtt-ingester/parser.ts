import { SENSOR_FIELD_MAP } from "@/types/sensor";

export interface ParsedReading {
  deviceId: string;
  recordedAt: Date;
  noiseDba: number | null;
  temperature: number | null;
  humidity: number | null;
  lightLux: number | null;
  pressurePa: number | null;
  uvIndex: number | null;
  pm1: number | null;
  pm25: number | null;
  pm4: number | null;
  pm10: number | null;
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

  const reading: ParsedReading = {
    deviceId: obj.device_id,
    recordedAt: new Date(obj.recorded_at),
    noiseDba: null,
    temperature: null,
    humidity: null,
    lightLux: null,
    pressurePa: null,
    uvIndex: null,
    pm1: null,
    pm25: null,
    pm4: null,
    pm10: null,
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

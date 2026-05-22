import { describe, it, expect } from "vitest";
import {
  parseSensorPayload,
  extractDeviceId,
  type ParsedReading,
} from "./parser";

describe("extractDeviceId", () => {
  it("extracts device id from MQTT topic", () => {
    const topic = "soundwatch/sensors/sck-store-042/readings";
    expect(extractDeviceId(topic)).toBe("sck-store-042");
  });

  it("returns null for invalid topic", () => {
    expect(extractDeviceId("invalid/topic")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDeviceId("")).toBeNull();
  });
});

describe("parseSensorPayload", () => {
  it("parses a valid full payload", () => {
    const payload = JSON.stringify({
      device_id: "sck-store-042",
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [
        { id: "noise_dba", value: 68.3 },
        { id: "temperature", value: 27.1 },
        { id: "humidity", value: 54.2 },
        { id: "light_lux", value: 340.0 },
        { id: "pressure_pa", value: 101325.0 },
        { id: "uv_index", value: 3.2 },
        { id: "pm1", value: 8.1 },
        { id: "pm25", value: 12.4 },
        { id: "pm4", value: 15.0 },
        { id: "pm10", value: 18.7 },
      ],
    });

    const result = parseSensorPayload(payload);
    expect(result).not.toBeNull();
    const reading = result as ParsedReading;
    expect(reading.deviceId).toBe("sck-store-042");
    expect(reading.recordedAt).toEqual(new Date("2026-06-15T14:30:00Z"));
    expect(reading.noiseDba).toBe(68.3);
    expect(reading.temperature).toBe(27.1);
    expect(reading.humidity).toBe(54.2);
    expect(reading.lightLux).toBe(340.0);
    expect(reading.pressurePa).toBe(101325.0);
    expect(reading.uvIndex).toBe(3.2);
    expect(reading.pm1).toBe(8.1);
    expect(reading.pm25).toBe(12.4);
    expect(reading.pm4).toBe(15.0);
    expect(reading.pm10).toBe(18.7);
  });

  it("parses a payload with only noise", () => {
    const payload = JSON.stringify({
      device_id: "sck-store-001",
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [{ id: "noise_dba", value: 72.0 }],
    });

    const result = parseSensorPayload(payload);
    expect(result).not.toBeNull();
    const reading = result as ParsedReading;
    expect(reading.deviceId).toBe("sck-store-001");
    expect(reading.noiseDba).toBe(72.0);
    expect(reading.temperature).toBeNull();
    expect(reading.humidity).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSensorPayload("not json")).toBeNull();
  });

  it("returns null for missing device_id", () => {
    const payload = JSON.stringify({
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [{ id: "noise_dba", value: 68.3 }],
    });
    expect(parseSensorPayload(payload)).toBeNull();
  });

  it("returns null for missing recorded_at", () => {
    const payload = JSON.stringify({
      device_id: "sck-store-042",
      sensors: [{ id: "noise_dba", value: 68.3 }],
    });
    expect(parseSensorPayload(payload)).toBeNull();
  });

  it("returns null for empty sensors array", () => {
    const payload = JSON.stringify({
      device_id: "sck-store-042",
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [],
    });
    expect(parseSensorPayload(payload)).toBeNull();
  });

  it("extracts firmware_version when present", () => {
    const payload = JSON.stringify({
      device_id: "sck-test-001",
      firmware_version: "1.2.3",
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [{ id: "noise_dba", value: 65.0 }],
    });

    const result = parseSensorPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.firmwareVersion).toBe("1.2.3");
  });

  it("firmware_version is undefined when not present", () => {
    const payload = JSON.stringify({
      device_id: "sck-test-001",
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [{ id: "noise_dba", value: 65.0 }],
    });

    const result = parseSensorPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.firmwareVersion).toBeUndefined();
  });

  it("ignores unknown sensor ids", () => {
    const payload = JSON.stringify({
      device_id: "sck-store-042",
      recorded_at: "2026-06-15T14:30:00Z",
      sensors: [
        { id: "noise_dba", value: 68.3 },
        { id: "unknown_sensor", value: 999 },
      ],
    });

    const result = parseSensorPayload(payload);
    expect(result).not.toBeNull();
    const reading = result as ParsedReading;
    expect(reading.noiseDba).toBe(68.3);
  });
});

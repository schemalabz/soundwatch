import { describe, it, expect } from "vitest";
import {
  parseSensorPayload,
  extractDeviceId,
  type ParsedReading,
} from "./parser";

// Real payloads captured from a bench SCK 2.3 running stock firmware (Step 1),
// published to `device/sck/<token>/readings/raw`. Format is NOT JSON:
// `{t:<iso>,<numeric-id>:<value>,...}` with unquoted keys and an unquoted
// ISO-8601 timestamp value (which itself contains ':').
const FULL_PAYLOAD =
  "{t:2026-07-23T15:55:50Z,10:27,221:1,220:-61,14:0,55:30.28,56:41.21," +
  "53:50.37,58:100.01,193:5.80,194:6.10,195:6.10,196:6.10,197:3930.00," +
  "198:4560.00,199:4580.00,200:4580.00,201:4580.00,202:0.43,214:0.00," +
  "215:0.00,216:0.00}";
const SPARSE_PAYLOAD =
  "{t:2026-07-23T15:56:50Z,10:29,221:1,220:-61,14:0,55:30.27,56:41.26," +
  "53:50.29,58:100.01,214:0.00,215:0.00,216:0.00}";

describe("extractDeviceId (stock topic)", () => {
  it("extracts the token from a stock readings topic", () => {
    expect(extractDeviceId("device/sck/abc123/readings/raw")).toBe("abc123");
  });

  it("returns null for a non-stock topic", () => {
    expect(extractDeviceId("soundwatch/sensors/sck-store-042/readings")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDeviceId("")).toBeNull();
  });
});

describe("parseSensorPayload (stock {t,<id>:value} format)", () => {
  it("parses recordedAt from the ISO timestamp (with its embedded colons)", () => {
    const reading = parseSensorPayload(FULL_PAYLOAD) as ParsedReading;
    expect(reading).not.toBeNull();
    expect(reading.recordedAt).toEqual(new Date("2026-07-23T15:55:50Z"));
  });

  it("maps numeric ids to typed columns", () => {
    const r = parseSensorPayload(FULL_PAYLOAD) as ParsedReading;
    expect(r.noiseDba).toBe(50.37); // id 53
    expect(r.temperature).toBe(30.28); // id 55
    expect(r.humidity).toBe(41.21); // id 56
    expect(r.lightLux).toBe(0); // id 14
    expect(r.battery).toBe(27); // id 10
    expect(r.rssi).toBe(-61); // id 220
    expect(r.sdCard).toBe(1); // id 221
    expect(r.pm1).toBe(5.8); // id 193
    expect(r.pm25).toBe(6.1); // id 194
    expect(r.pn05).toBe(3930); // id 197
    expect(r.tps).toBe(0.43); // id 202
    expect(r.uvA).toBe(0); // id 214
  });

  it("converts barometric pressure from kPa (id 58) to Pa", () => {
    const r = parseSensorPayload(FULL_PAYLOAD) as ParsedReading;
    expect(r.pressurePa).toBe(100010); // 100.01 kPa -> 100010 Pa
  });

  it("leaves absent metrics null (sparse payload)", () => {
    const r = parseSensorPayload(SPARSE_PAYLOAD) as ParsedReading;
    expect(r.noiseDba).toBe(50.29);
    expect(r.pm1).toBeNull(); // id 193 absent in sparse payload
    expect(r.pn05).toBeNull(); // id 197 absent
    expect(r.tps).toBeNull(); // id 202 absent
  });

  it("skips a metric with a blank value (keeps it null, not 0)", () => {
    const r = parseSensorPayload("{t:2026-07-23T15:55:50Z,53:,55:30.0}") as ParsedReading;
    expect(r).not.toBeNull();
    expect(r.noiseDba).toBeNull(); // blank value must NOT become 0
    expect(r.temperature).toBe(30.0);
  });

  it("ignores unknown numeric ids", () => {
    const r = parseSensorPayload("{t:2026-07-23T15:55:50Z,53:50.0,999:123}") as ParsedReading;
    expect(r).not.toBeNull();
    expect(r.noiseDba).toBe(50.0);
  });

  it("returns null when the timestamp is missing", () => {
    expect(parseSensorPayload("{53:50.0,55:30.0}")).toBeNull();
  });

  it("returns null for a malformed payload", () => {
    expect(parseSensorPayload("not a payload")).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(parseSensorPayload("{}")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { extractDeviceId, parseSensorPayload } from "../mqtt-ingester/parser";
import { FLEET } from "./fleet";
import { generateReading } from "./model";
import { buildPayload, NETBUFF_SIZE } from "./payload";

const T0 = Date.UTC(2026, 5, 16, 9, 0, 0) / 1000;

describe("wire payload", () => {
  it("parses with the real parser for every fleet sensor", () => {
    for (const sensor of FLEET) {
      const r = generateReading(sensor, T0, 60);
      const parsed = parseSensorPayload(buildPayload(r));
      expect(parsed, sensor.deviceId).not.toBeNull();
      expect(parsed!.recordedAt.getTime()).toBe(r.recordedAt.getTime());
      expect(parsed!.energySum).toBe(r.energySum);
      expect(parsed!.frameCount).toBe(r.frameCount);
      expect(parsed!.payloadVersion).toBe(4); // level-linearity fix applied
      expect(parsed!.intervalS).toBe(r.intervalMs); // v3+: id 238 carries ms
      expect(parsed!.noiseDba).toBeNull(); // id 53 must never be sent
      expect(parsed!.pressurePa).toBeCloseTo(r.pressureKpa * 1000, 5);
    }
  });

  it("stays under the 512-byte NETBUFF budget in the worst case", () => {
    // Hunt a worst case: PM block + light + bands present, 60s interval
    // (largest histogram counts), across the whole fleet and many intervals.
    let maxLen = 0;
    for (const sensor of FLEET) {
      for (let k = 0; k < 500; k++) {
        const r = generateReading(sensor, T0 + k * 60, 60);
        const len = buildPayload(r).length; // buildPayload throws over budget
        if (len > maxLen) maxLen = len;
      }
    }
    expect(maxLen).toBeLessThanOrEqual(NETBUFF_SIZE);
  });

  it("timestamps are second-precision ISO with Z suffix", () => {
    const r = generateReading(FLEET[0], T0, 60);
    const payload = buildPayload(r);
    expect(payload).toMatch(/^\{t:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z,/);
  });

  it("device topic matches the ingester's regex for all fleet ids", () => {
    for (const sensor of FLEET) {
      expect(extractDeviceId(`device/sck/${sensor.deviceId}/readings/raw`)).toBe(sensor.deviceId);
    }
  });
});

import { describe, it, expect } from "vitest";
import { decodeDiagnostics, wasWatchdogReset } from "./diagnostics";

describe("decodeDiagnostics", () => {
  it("decodes a real payload from the bench fleet", () => {
    // Captured from bench2: uptime-heap-rcause-wifi-pubfail-capfail
    const d = decodeDiagnostics("255-3132-64-1-0-2778");
    expect(d).toEqual({
      deviceUptimeS: 255,
      freeHeapBytes: 3132,
      resetCause: 64,
      wifiConnects: 1,
      publishFails: 0,
      captureFails: 2778,
    });
  });

  it("returns null when the field is absent (older firmware omits id 243)", () => {
    expect(decodeDiagnostics(null)).toBeNull();
    expect(decodeDiagnostics(undefined)).toBeNull();
    expect(decodeDiagnostics("")).toBeNull();
  });

  it("keeps the reading usable when segments are missing", () => {
    // Health telemetry must never be able to reject a measurement.
    const d = decodeDiagnostics("100-2048");
    expect(d?.deviceUptimeS).toBe(100);
    expect(d?.freeHeapBytes).toBe(2048);
    expect(d?.resetCause).toBeNull();
    expect(d?.captureFails).toBeNull();
  });

  it("nulls non-numeric segments rather than throwing", () => {
    const d = decodeDiagnostics("100-abc-64-1-0-5");
    expect(d?.deviceUptimeS).toBe(100);
    expect(d?.freeHeapBytes).toBeNull();
    expect(d?.resetCause).toBe(64);
  });

  it("identifies a watchdog reset (32) and not a normal boot (64)", () => {
    // 64 = SYST covers both a software reset AND a power cycle on this board,
    // because the UF2 bootloader resets before the app runs.
    expect(wasWatchdogReset(decodeDiagnostics("10-2000-32-1-0-0"))).toBe(true);
    expect(wasWatchdogReset(decodeDiagnostics("10-2000-64-1-0-0"))).toBe(false);
    expect(wasWatchdogReset(null)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { decodeDiagnostics, wasWatchdogReset, firmwarePairMismatched, builtFromDirtyTree } from "./diagnostics";

describe("decodeDiagnostics", () => {
  it("decodes a real payload from the bench fleet (pre-A: 6 fields, reinits null)", () => {
    // Captured from bench2: uptime-heap-rcause-wifi-pubfail-capfail
    const d = decodeDiagnostics("255-3132-64-1-0-2778");
    expect(d).toEqual({
      deviceUptimeS: 255,
      freeHeapBytes: 3132,
      resetCause: 64,
      wifiConnects: 1,
      publishFails: 0,
      captureFails: 2778,
      i2sReinits: null,
      ghostRefusals: null,
      soundwatchRelease: null,
      samGitHash: null,
      espGitHash: null,
      energySaturations: null,
    });
  });

  it("decodes the Approach-A payload (7th field: cumulative I2S reinits)", () => {
    const d = decodeDiagnostics("810-7944-64-1-0-41-13");
    expect(d?.captureFails).toBe(41);
    expect(d?.i2sReinits).toBe(13);
    expect(d?.ghostRefusals).toBeNull();
  });

  it("decodes the ghost-tripwire payload (8th field: refused blanking syncs)", () => {
    const d = decodeDiagnostics("810-7944-64-1-0-41-13-1");
    expect(d?.ghostRefusals).toBe(1);
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

  it("decodes the release-1.0 payload (fields 9-11: release, SAM hash, ESP hash)", () => {
    const d = decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-3e69ded-3e69ded");
    expect(d?.soundwatchRelease).toBe("1.0");
    expect(d?.samGitHash).toBe("3e69ded");
    expect(d?.espGitHash).toBe("3e69ded");
    // The counters before them must be untouched by the new string fields.
    expect(d?.captureFails).toBe(41);
    expect(d?.i2sReinits).toBe(13);
    expect(d?.ghostRefusals).toBe(0);
  });

  it("leaves the release fields null on pre-1.0 firmware", () => {
    const d = decodeDiagnostics("810-7944-64-1-0-41-13-1");
    expect(d?.soundwatchRelease).toBeNull();
    expect(d?.samGitHash).toBeNull();
    expect(d?.espGitHash).toBeNull();
  });

  it("normalises the 'na' hash the SAM sends before the ESP has synced", () => {
    // The SAM emits "na" rather than an empty field so the payload keeps its
    // shape; the database should hold null, not the sentinel.
    const d = decodeDiagnostics("30-7944-64-0-0-0-0-0-1.0-3e69ded-na");
    expect(d?.samGitHash).toBe("3e69ded");
    expect(d?.espGitHash).toBeNull();
  });

  it("preserves the dirty-build marker rather than cleaning it away", () => {
    // "+" means the image was built from a modified tree and does NOT
    // reproduce from the commit it names. Stripping it would recreate exactly
    // the lie the stamp exists to prevent.
    const d = decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-3e69ded+-3e69ded+");
    expect(d?.samGitHash).toBe("3e69ded+");
    expect(builtFromDirtyTree(d)).toBe(true);
    expect(builtFromDirtyTree(decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-3e69ded-3e69ded"))).toBe(false);
  });

  it("flags a SAM/ESP pair built from different trees", () => {
    // The bug release 1.0 exists to close: the fleet ran a SAM from one branch
    // and an ESP from another, and nothing on the wire could reveal it.
    const split = decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-3e69ded-73cc80b");
    expect(firmwarePairMismatched(split)).toBe(true);

    const matched = decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-3e69ded-3e69ded");
    expect(firmwarePairMismatched(matched)).toBe(false);

    // Unknowable is not the same as mismatched: pre-1.0 firmware, or an ESP
    // that has not synced yet, must not raise a false alarm.
    expect(firmwarePairMismatched(decodeDiagnostics("810-7944-64-1-0-41-13-1"))).toBe(false);
    expect(firmwarePairMismatched(decodeDiagnostics("30-7944-64-0-0-0-0-0-1.0-3e69ded-na"))).toBe(false);
    expect(firmwarePairMismatched(null)).toBe(false);
    expect(builtFromDirtyTree(null)).toBe(false);
  });

  it("decodes energy saturations (field 12) and leaves it null before the fix", () => {
    // The energy accumulator clamps rather than wrapping, because a wrapped
    // int64 would report SILENCE at the loudest moment captured. Non-zero means
    // that interval's LAeq is a lower bound, not a measurement.
    const d = decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-d782b1f-d782b1f-3");
    expect(d?.energySaturations).toBe(3);
    expect(d?.samGitHash).toBe("d782b1f");

    // Healthy unit on the fixed firmware: present and zero.
    expect(decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-d782b1f-d782b1f-0")?.energySaturations).toBe(0);
    // Pre-fix firmware never sends it — absent, not zero. The difference matters:
    // zero is "measured and fine", null is "this build could not tell you".
    expect(decodeDiagnostics("810-7944-64-1-0-41-13-0-1.0-3e69ded-3e69ded")?.energySaturations).toBeNull();
    expect(decodeDiagnostics("810-7944-64-1-0-41-13-1")?.energySaturations).toBeNull();
  });

  it("identifies a watchdog reset (32) and not a normal boot (64)", () => {
    // 64 = SYST covers both a software reset AND a power cycle on this board,
    // because the UF2 bootloader resets before the app runs.
    expect(wasWatchdogReset(decodeDiagnostics("10-2000-32-1-0-0"))).toBe(true);
    expect(wasWatchdogReset(decodeDiagnostics("10-2000-64-1-0-0"))).toBe(false);
    expect(wasWatchdogReset(null)).toBe(false);
  });
});

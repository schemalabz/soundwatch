import { describe, expect, it } from "vitest";
import { FLEET, phaseOffsetS } from "./fleet";
import { generateReading, targetLevelDb, localTime, calibrationOffsetDb, clockDriftS } from "./model";
import { buildPayload } from "./payload";
import { payloadToRow } from "./rowBuilder";
import { parseSensorPayload } from "../mqtt-ingester/parser";

// A fixed reference instant: Tuesday 2026-06-16 (UTC). All tests derive times
// from this so they never depend on wall-clock now.
const TUESDAY_UTC = Date.UTC(2026, 5, 16, 0, 0, 0) / 1000;
const DAY = 86400;

const exarchia = FLEET.find((s) => s.deviceId === "sim-exarchia")!;
const kifisia = FLEET.find((s) => s.deviceId === "sim-kifisia")!;
const melissia = FLEET.find((s) => s.deviceId === "sim-melissia")!;

/** Local Athens hour h on the day that starts at dayStartUtc (UTC+3 fixed). */
function atLocalHour(dayStartUtc: number, hour: number): number {
  return dayStartUtc + hour * 3600 - 3 * 3600;
}

describe("fleet", () => {
  it("has 50 sensors with unique device ids and coordinates", () => {
    expect(FLEET).toHaveLength(50);
    const ids = new Set(FLEET.map((s) => s.deviceId));
    expect(ids.size).toBe(50);
    for (const s of FLEET) {
      expect(s.latitude).toBeGreaterThan(37.7);
      expect(s.latitude).toBeLessThan(38.2);
      expect(s.longitude).toBeGreaterThan(23.5);
      expect(s.longitude).toBeLessThan(23.9);
    }
  });

  it("spreads publish phases across the interval", () => {
    const phases = new Set(FLEET.map((s) => phaseOffsetS(s.deviceId, 60)));
    expect(phases.size).toBeGreaterThan(20); // not all in lockstep
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(60);
    }
  });
});

describe("model determinism and continuity", () => {
  it("is deterministic: same inputs, same reading", () => {
    const a = generateReading(exarchia, TUESDAY_UTC + 1234, 60);
    const b = generateReading(exarchia, TUESDAY_UTC + 1234, 60);
    expect(buildPayload(a)).toBe(buildPayload(b));
  });

  it("wanders smoothly: adjacent 60s readings move < 4 dB", () => {
    for (let k = 0; k < 200; k++) {
      const t = TUESDAY_UTC + k * 60;
      const d = Math.abs(targetLevelDb(exarchia, t + 60) - targetLevelDb(exarchia, t));
      expect(d).toBeLessThan(4);
    }
  });

  it("is continuous across an arbitrary backfill/live boundary", () => {
    // Backfill at 60s cadence up to the boundary, live at 5s after it: the
    // model is a pure function of t, so the seam must not jump.
    const boundary = TUESDAY_UTC + 5 * DAY + 7231;
    const before = targetLevelDb(kifisia, boundary - 60);
    const after = targetLevelDb(kifisia, boundary + 5);
    expect(Math.abs(after - before)).toBeLessThan(5);
  });
});

describe("round-trip through the real ingester code", () => {
  it("recovers laeq ≈ target on event-free intervals", () => {
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      const r = generateReading(exarchia, TUESDAY_UTC + k * 60, 60);
      if (r.event) continue;
      const row = payloadToRow(buildPayload(r), r.recordedAt);
      expect(row).not.toBeNull();
      expect(row!.laeq).not.toBeNull();
      expect(Math.abs(row!.laeq! - r.targetLaeq)).toBeLessThan(0.7);
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("produces internally consistent percentiles and extremes", () => {
    for (let k = 0; k < 100; k++) {
      const r = generateReading(kifisia, TUESDAY_UTC + k * 60, 60);
      const row = payloadToRow(buildPayload(r), r.recordedAt)!;
      expect(row.l10).not.toBeNull();
      expect(row.l10!).toBeGreaterThanOrEqual(row.l50!);
      expect(row.l50!).toBeGreaterThanOrEqual(row.l90!);
      expect(row.lmaxEst!).toBeGreaterThanOrEqual(row.laeq!);
      expect(row.lminEst!).toBeLessThanOrEqual(row.laeq! + 0.01);
      expect(row.histRaw!.split("-")).toHaveLength(30);
      const histSum = row.histRaw!.split("-").reduce((a, b) => a + Number(b), 0);
      expect(histSum).toBe(row.frameCount);
      // ~33% is the device's compute ceiling (a frame costs ~27.8 ms to cover
      // 11.6 ms of sound), and release 1.1 sustains p50 ~31%.
      expect(row.realizedDuty!).toBeGreaterThan(0.05);
      expect(row.realizedDuty!).toBeLessThanOrEqual(0.34);
    }
  });

  it("alternates bands and diagnostics across intervals, both decodable", () => {
    const r0 = generateReading(exarchia, TUESDAY_UTC, 60); // even interval index
    const r1 = generateReading(exarchia, TUESDAY_UTC + 60, 60);
    const withBands = r0.bandsDb10 ? r0 : r1;
    const withDiag = r0.diagString ? r0 : r1;
    expect(withBands.bandsDb10).toHaveLength(21);
    const bandsRow = payloadToRow(buildPayload(withBands), withBands.recordedAt)!;
    expect(bandsRow.bandsDb).toHaveLength(21);
    const diagRow = payloadToRow(buildPayload(withDiag), withDiag.recordedAt)!;
    expect(diagRow.deviceUptimeS).not.toBeNull();
    expect(diagRow.samGitHash).toBe("ef1ba3e");
    expect(diagRow.soundwatchRelease).toBe("1.1");
    expect(diagRow.energySaturations).toBe(0); // healthy 1.1 unit
  });

  it("events fatten the tail: lmaxEst well above laeq", () => {
    let found = false;
    for (let k = 0; k < 2000 && !found; k++) {
      const r = generateReading(exarchia, TUESDAY_UTC + k * 60, 60);
      if (!r.event) continue;
      found = true;
      const row = payloadToRow(buildPayload(r), r.recordedAt)!;
      expect(row.lmaxEst!).toBeGreaterThan(row.laeq! + 5);
    }
    expect(found).toBe(true);
  });
});

describe("realism contrasts (what the future filter UI must show)", () => {
  /** Energy-domain mean over sampled intervals, like the rollups will do. */
  function meanLevel(sensor: (typeof FLEET)[number], times: number[]): number {
    const energies = times.map((t) => Math.pow(10, targetLevelDb(sensor, t) / 10));
    return 10 * Math.log10(energies.reduce((a, b) => a + b, 0) / energies.length);
  }

  it("nightlife at 22h is much louder than residential at 04h", () => {
    const nights = Array.from({ length: 14 }, (_, d) => atLocalHour(TUESDAY_UTC + d * DAY, 22));
    const smallHours = Array.from({ length: 14 }, (_, d) => atLocalHour(TUESDAY_UTC + d * DAY, 4));
    expect(meanLevel(exarchia, nights)).toBeGreaterThan(meanLevel(melissia, smallHours) + 10);
  });

  it("Saturday night is louder than Tuesday night at a nightlife spot", () => {
    // TUESDAY_UTC is a Tuesday; +4 days = Saturday.
    const tuesdays = Array.from({ length: 8 }, (_, w) => atLocalHour(TUESDAY_UTC + w * 7 * DAY, 23));
    const saturdays = Array.from({ length: 8 }, (_, w) => atLocalHour(TUESDAY_UTC + (4 + w * 7) * DAY, 23));
    expect(meanLevel(exarchia, saturdays)).toBeGreaterThan(meanLevel(exarchia, tuesdays) + 1.5);
  });

  it("commercial Sunday daytime is quieter than weekday daytime", () => {
    const mondays = Array.from({ length: 8 }, (_, w) => atLocalHour(TUESDAY_UTC + (6 + w * 7) * DAY, 12));
    const sundays = Array.from({ length: 8 }, (_, w) => atLocalHour(TUESDAY_UTC + (5 + w * 7) * DAY, 12));
    expect(meanLevel(kifisia, mondays)).toBeGreaterThan(meanLevel(kifisia, sundays) + 3);
  });

  it("localTime maps UTC to Athens hours and weekdays", () => {
    const lt = localTime(TUESDAY_UTC); // midnight UTC Tuesday = 03:00 Athens
    expect(lt.hour).toBe(3);
    expect(lt.dow).toBe(2);
  });
});

describe("firmware 1.1 realism", () => {
  it("gives each unit a calibration offset, spanning ~1.8 dB across the fleet", () => {
    const offsets = FLEET.map((s) => calibrationOffsetDb(s.deviceId));
    for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(0.9);
    // Two co-located bench units measured a mean difference of +1.82 dB; the
    // fleet spread should reach that, since it is the floor on any honest
    // between-unit comparison the leaderboard renders.
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(1.4);
    // Deterministic.
    expect(calibrationOffsetDb(FLEET[0].deviceId)).toBe(offsets[0]);
  });

  it("drifts the device clock forward and resets it at reboot", () => {
    const id = FLEET[0].deviceId;
    const drifts = Array.from({ length: 400 }, (_, k) => clockDriftS(id, TUESDAY_UTC + k * 3600));
    for (const d of drifts) {
      expect(d).toBeGreaterThanOrEqual(0); // never backwards
      expect(d).toBeLessThan(3 * 3600); // bounded: reboots resync
    }
    expect(Math.max(...drifts)).toBeGreaterThan(60); // it actually drifts
    // It must come back down — that reset is what makes recorded_at ordering
    // manufacture phantom reboots, and why every ordering query uses
    // received_at.
    expect(drifts.some((d, i) => i > 0 && d < drifts[i - 1])).toBe(true);
  });

  it("stamps the device clock on the wire and the true instant as received", () => {
    const r = generateReading(FLEET[0], TUESDAY_UTC + 40 * 3600, 60);
    expect(r.recordedAt.getTime()).toBeGreaterThanOrEqual(r.receivedAt.getTime());
    // The payload carries the DEVICE's claim, not the server's.
    const parsed = parseSensorPayload(buildPayload(r))!;
    expect(parsed.recordedAt.getTime()).toBe(r.recordedAt.getTime());
  });

  it("reaches the levels only 1.1 can report", () => {
    // Pre-fix firmware clamped at ~68 device-dB and the fleet never passed
    // 65.8; post-fix the observed range is 33.8 - 97.7.
    let max = -Infinity;
    for (const s of FLEET) {
      for (let k = 0; k < 400; k++) max = Math.max(max, targetLevelDb(s, TUESDAY_UTC + k * 1800));
    }
    expect(max).toBeGreaterThan(80);
    expect(max).toBeLessThanOrEqual(100);
  });
});

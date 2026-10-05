import { describe, expect, it } from "vitest";
import { diagnose, type DiagnosisInput } from "./diagnosis";

// Δάφνη, Sep 29: the case the diagnosis was argued from.
const dafni: DiagnosisInput = {
  cause: "network_lost_powered",
  batteryLast: 98,
  batteryMin1h: 97,
  batteryMax1h: 98,
  rssiLastHour: -53,
  publishFails1h: 0,
  routerRestartsBefore: [
    { at: "2026-09-29T08:07:13Z", ip: "37.6.243.26" },
    { at: "2026-09-29T08:58:29Z", ip: "79.107.86.91" },
  ],
  lastDisconnect: { at: "2026-09-29T14:57:42Z", reason: "exceeded timeout" },
  unscheduledBootsBefore: 1,
  lastReceivedAt: "2026-09-29T14:54:00Z",
  brokerRecordsFrom: "2026-09-24T17:50:00Z",
};

describe("diagnose", () => {
  it("Δάφνη: every piece of evidence supports 'network lost, sensor powered'", () => {
    const d = diagnose(dafni);
    expect(d.headline).toBe("The store’s internet went away. The sensor still had power.");
    expect(d.evidence.map((e) => e.claim)).toEqual([
      "The sensor had power",
      "The router restarted 2 times",
      "Wifi was healthy to the end",
      "The network vanished, not the unit",
      "1 unscheduled restart",
    ]);
    expect(d.evidence.every((e) => e.supports)).toBe(true);
    expect(d.evidence[1].detail).toContain("11:07 and 11:58");
  });

  it("a draining battery says mains power", () => {
    const d = diagnose({ ...dafni, cause: "on_battery", batteryLast: 81, batteryMin1h: 81, batteryMax1h: 96, routerRestartsBefore: [] });
    expect(d.evidence[0].claim).toBe("The battery was draining");
  });

  it("never joined wifi (Περιστέρι D012 at install) is called out, not hidden", () => {
    const d = diagnose({ ...dafni, cause: "unknown", rssiLastHour: null, lastDisconnect: null, routerRestartsBefore: [] });
    expect(d.evidence.find((e) => e.claim === "It was not on wifi")).toBeTruthy();
  });

  it("a unit whose connection simply stayed up is not blamed on the log", () => {
    const { evidence } = diagnose({ ...dafni, routerRestartsBefore: [], lastDisconnect: null });
    expect(evidence.map((e) => e.claim)).not.toContain("No connection records for that day");
  });

  it("a silence older than the log says so, with the log's real start", () => {
    const { evidence } = diagnose({ ...dafni, lastReceivedAt: "2026-09-10T15:05:00Z", routerRestartsBefore: [], lastDisconnect: null });
    expect(evidence.find((e) => e.claim === "No connection records for that day")?.detail)
      .toBe("The broker’s log starts 24 Sept, after the day before it went silent, so router restarts cannot be checked.");
  });

  it("0% battery decides nothing", () => {
    const d = diagnose({ ...dafni, cause: "unknown", batteryLast: 0 });
    expect(d.evidence[0]).toMatchObject({ claim: "Battery tells us nothing", supports: false });
  });

  it("a 2 % battery tells us nothing about power", () => {
    const { evidence } = diagnose({ ...dafni, cause: "unknown", batteryLast: 2, batteryMin1h: 2, batteryMax1h: 2 });
    expect(evidence[0]).toEqual({
      claim: "Battery tells us nothing",
      detail: "It reads 2% — too low to tell a power cut from a network outage.",
      supports: false,
    });
  });
});

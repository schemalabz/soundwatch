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
    expect(d.ask).toContain("Was the internet being worked on that day?");
  });

  it("a draining battery says mains power, and asks about the socket", () => {
    const d = diagnose({ ...dafni, cause: "on_battery", batteryLast: 81, batteryMin1h: 81, batteryMax1h: 96, routerRestartsBefore: [] });
    expect(d.evidence[0].claim).toBe("The battery was draining");
    expect(d.ask[0]).toMatch(/plugged in/);
  });

  it("never joined wifi (Περιστέρι D012 at install) is called out, not hidden", () => {
    const d = diagnose({ ...dafni, cause: "unknown", rssiLastHour: null, lastDisconnect: null, routerRestartsBefore: [] });
    expect(d.evidence.find((e) => e.claim === "It was not on wifi")).toBeTruthy();
  });

  it("0% battery decides nothing", () => {
    const d = diagnose({ ...dafni, cause: "unknown", batteryLast: 0 });
    expect(d.evidence[0]).toMatchObject({ claim: "Battery tells us nothing", supports: false });
  });
});

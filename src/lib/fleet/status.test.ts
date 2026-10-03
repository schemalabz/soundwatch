import { describe, expect, it } from "vitest";
import {
  cellState,
  fleetStatus,
  isBoot,
  isScheduledBoot,
  lifecycleStatus,
  silentCause,
  watchReasons,
  type StatusInput,
} from "./status";

const now = new Date("2026-10-03T12:00:00Z");
const base: StatusInput = {
  retiredAt: null,
  isExperimental: false,
  provisionedAt: new Date("2026-08-05T09:00:00Z"),
  handedOverAt: null,
  installedAt: new Date("2026-08-28T12:00:00Z"),
  lastReceivedAt: new Date("2026-10-03T11:59:30Z"),
};
const healthy = { rssiAvg: -55, unscheduledBoots: 0, routerRestarts: 0 };

describe("lifecycleStatus", () => {
  it("retired wins over everything, bench next", () => {
    expect(lifecycleStatus({ ...base, retiredAt: now, isExperimental: true }, now)).toBe("retired");
    expect(lifecycleStatus({ ...base, isExperimental: true }, now)).toBe("bench");
    expect(lifecycleStatus({ ...base, isActive: false }, now)).toBe("retired");
  });

  it("walks minted → in box → with installer before install", () => {
    const pre = { ...base, installedAt: null };
    expect(lifecycleStatus({ ...pre, provisionedAt: null }, now)).toBe("minted");
    expect(lifecycleStatus(pre, now)).toBe("in_box");
    expect(lifecycleStatus({ ...pre, handedOverAt: now }, now)).toBe("with_installer");
  });

  it("an in-box unit that published during its bench check is still in box", () => {
    expect(lifecycleStatus({ ...base, installedAt: null, lastReceivedAt: now }, now)).toBe("in_box");
  });

  it("installed: live under 15 minutes of silence, silent at 15", () => {
    expect(lifecycleStatus({ ...base, lastReceivedAt: new Date(now.getTime() - 14 * 60_000) }, now)).toBe("live");
    expect(lifecycleStatus({ ...base, lastReceivedAt: new Date(now.getTime() - 15 * 60_000) }, now)).toBe("silent");
    expect(lifecycleStatus({ ...base, lastReceivedAt: null }, now)).toBe("silent");
  });
});

describe("watch", () => {
  it("is healthy with good signal and no restarts", () => {
    expect(watchReasons(healthy)).toEqual([]);
    expect(fleetStatus(base, healthy, now)).toBe("live");
  });

  it("flags weak signal, repeated unscheduled restarts and router restarts", () => {
    expect(watchReasons({ ...healthy, rssiAvg: -72 })).toEqual(["weak wifi signal (-72 dBm)"]);
    expect(watchReasons({ ...healthy, unscheduledBoots: 2 })).toEqual(["2 unscheduled restarts"]);
    expect(watchReasons({ ...healthy, routerRestarts: 2 })).toEqual(["store router restarted 2 times"]);
    expect(fleetStatus(base, { ...healthy, rssiAvg: -72 }, now)).toBe("watch");
  });

  it("Αμπελόκηποι at −69 dBm is not on watch; one restart is not a pattern", () => {
    expect(watchReasons({ rssiAvg: -69, unscheduledBoots: 1, routerRestarts: 1 })).toEqual([]);
  });

  it("only applies to live units", () => {
    expect(fleetStatus({ ...base, lastReceivedAt: null }, { ...healthy, rssiAvg: -80 }, now)).toBe("silent");
  });
});

describe("restarts", () => {
  it("a boot is uptime going down", () => {
    expect(isBoot(86241, 103)).toBe(true);
    expect(isBoot(103, 133)).toBe(false);
    expect(isBoot(null, 40)).toBe(false);
  });

  it("05:00–07:00 Athens is the scheduled window, both sides of DST", () => {
    expect(isScheduledBoot(new Date("2026-09-29T03:13:00Z"))).toBe(true); // 06:13 EEST
    expect(isScheduledBoot(new Date("2026-09-29T02:40:00Z"))).toBe(true); // 05:40, fast clock
    expect(isScheduledBoot(new Date("2026-09-29T08:58:00Z"))).toBe(false); // 11:58, Δάφνη
    expect(isScheduledBoot(new Date("2026-12-01T04:10:00Z"))).toBe(true); // 06:10 EET
  });
});

describe("silentCause", () => {
  it("full steady battery at the end = network lost, sensor powered (Δάφνη)", () => {
    expect(silentCause({ batteryMin: 97, batteryMax: 98, batteryLast: 98 })).toBe("network_lost_powered");
  });

  it("battery falling to the end = running on battery", () => {
    expect(silentCause({ batteryMin: 81, batteryMax: 96, batteryLast: 81 })).toBe("on_battery");
  });

  it("no battery reading, or 0% (flat or disconnected), decides nothing", () => {
    expect(silentCause({ batteryMin: null, batteryMax: null, batteryLast: null })).toBe("unknown");
    expect(silentCause({ batteryMin: 0, batteryMax: 0, batteryLast: 0 })).toBe("unknown");
  });

  it("a battery charging up from empty at install is not a mains loss", () => {
    expect(silentCause({ batteryMin: 3, batteryMax: 40, batteryLast: 40 })).toBe("unknown");
  });
});

describe("cellState", () => {
  it("separates live, measured-offline, silent and not-expected", () => {
    expect(cellState(120, 118, true)).toBe("live");
    expect(cellState(120, 0, true)).toBe("offline");
    expect(cellState(0, 0, true)).toBe("silent");
    expect(cellState(0, 0, false)).toBe("none");
  });
});

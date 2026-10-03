import { describe, expect, it } from "vitest";
import { discordMessage, evaluate, type AlertUnit } from "./alerts";

const now = new Date("2026-09-29T15:30:00Z");
const healthy: AlertUnit = {
  sensorId: "s1", title: "Skroutz Δάφνη", apName: "Soundwatch-05F3",
  lastReceivedAt: new Date(now.getTime() - 30_000),
  batteryLast: 98, batteryMin1h: 97, batteryMax1h: 98, rssiAvg1h: -53,
  unscheduledBoots24h: 0, routerRestarts24h: 0,
};

describe("evaluate", () => {
  it("a healthy unit opens nothing", () => {
    expect(evaluate([healthy], [], now)).toEqual({ open: [], close: [], closeQuiet: [] });
  });

  it("silent for 30 minutes opens a silent incident with its likely cause", () => {
    const d = evaluate([{ ...healthy, lastReceivedAt: new Date(now.getTime() - 31 * 60_000) }], [], now);
    expect(d.open).toHaveLength(1);
    expect(d.open[0]).toMatchObject({ kind: "silent", cause: "network_lost_powered" });
    // dated from the last reading + 30 min, not from the evaluation
    expect(d.open[0].since).toEqual(new Date(now.getTime() - 60_000));
  });

  it("29 minutes is not yet an incident (the 15-minute 'silent' status is not a page)", () => {
    expect(evaluate([{ ...healthy, lastReceivedAt: new Date(now.getTime() - 29 * 60_000) }], [], now).open).toEqual([]);
  });

  it("an already-open incident is not opened twice", () => {
    const silent = { ...healthy, lastReceivedAt: new Date(now.getTime() - 3600_000) };
    expect(evaluate([silent], [{ id: 1, sensorId: "s1", kind: "silent" }], now)).toEqual({ open: [], close: [], closeQuiet: [] });
  });

  it("closes when the unit is back", () => {
    expect(evaluate([healthy], [{ id: 7, sensorId: "s1", kind: "silent" }], now).close).toEqual([7]);
  });

  it("closes incidents of units no longer evaluated (retired) quietly — nothing came back", () => {
    const d = evaluate([], [{ id: 9, sensorId: "gone", kind: "silent" }], now);
    expect(d.close).toEqual([]);
    expect(d.closeQuiet).toEqual([9]);
  });

  it("a unit going silent does not 'resolve' its router-restart incident", () => {
    const silent = { ...healthy, lastReceivedAt: new Date(now.getTime() - 3600_000), routerRestarts24h: 2 };
    const d = evaluate([silent], [{ id: 3, sensorId: "s1", kind: "router_restarts" }], now);
    expect(d.close).toEqual([]);
    expect(d.open.map((o) => o.kind)).toEqual(["silent"]);
  });

  it("weak signal has hysteresis: open below −72, resolve only above −69", () => {
    const openWeak = [{ id: 5, sensorId: "s1", kind: "weak_signal" as const }];
    expect(evaluate([{ ...healthy, rssiAvg1h: -71 }], openWeak, now).close).toEqual([]);
    expect(evaluate([{ ...healthy, rssiAvg1h: -68 }], openWeak, now).close).toEqual([5]);
    expect(evaluate([{ ...healthy, rssiAvg1h: -71 }], [], now).open).toEqual([]);
  });

  it("router restarts, unscheduled restarts and weak signal open their own incidents on a live unit", () => {
    const d = evaluate([{ ...healthy, routerRestarts24h: 2, unscheduledBoots24h: 3, rssiAvg1h: -75 }], [], now);
    expect(d.open.map((o) => o.kind).sort()).toEqual(["router_restarts", "unscheduled_restarts", "weak_signal"]);
  });

  it("a silent unit raises only the silence", () => {
    const d = evaluate([{ ...healthy, lastReceivedAt: null, routerRestarts24h: 5 }], [], now);
    expect(d.open.map((o) => o.kind)).toEqual(["silent"]);
  });
});

describe("discordMessage", () => {
  const unit = { title: "Skroutz Δάφνη", apName: "Soundwatch-05F3", sensorId: "abc" };

  it("a silent incident says why and links to the unit", () => {
    const m = discordMessage(
      { kind: "silent", cause: "network_lost_powered", openedAt: now, closedAt: null, evidence: { batteryLast: 98, routerRestarts24h: 2 } },
      unit, "https://soundwatch.gr",
    );
    const e = m.embeds[0] as { title: string; description: string; url: string };
    expect(e.title).toBe("Skroutz Δάφνη (05F3) is silent");
    expect(e.description).toContain("The store’s internet went away");
    expect(e.description).toContain("restarted 2×");
    expect(e.url).toBe("https://soundwatch.gr/admin/units/abc");
  });

  it("a resolved silence counts from the last reading, not from when it was flagged", () => {
    const m = discordMessage(
      { kind: "silent", cause: null, openedAt: new Date(now.getTime() - 2.5 * 3600_000), closedAt: now,
        evidence: { lastReceivedAt: new Date(now.getTime() - 3 * 3600_000).toISOString() } },
      unit, null,
    );
    const e = m.embeds[0] as { title: string; description: string; url?: string };
    expect(e.title).toBe("✓ Skroutz Δάφνη (05F3) — resolved");
    expect(e.description).toBe("Back after 3 h.");
    expect(e.url).toBeUndefined();
  });

  it("a weak-signal incident holds through an hour with no RSSI", () => {
    const d = evaluate([{ ...healthy, rssiAvg1h: null }], [{ id: 1, sensorId: healthy.sensorId, kind: "weak_signal" }], now);
    expect(d.close).toEqual([]);
  });

  it("restart incidents resolve without claiming the unit was away", () => {
    const msg = discordMessage(
      { kind: "router_restarts", cause: null, openedAt: new Date("2026-10-03T13:00:00Z"), closedAt: new Date("2026-10-04T12:00:00Z"), evidence: { count: 2 } },
      { title: "Box D084", apName: "Soundwatch-D084", sensorId: "s1" }, null,
    );
    const text = (msg.embeds[0] as { description: string }).description;
    expect(text).toBe("Fewer than 2 router restarts in the last 24 h (open 23 h).");
  });
});

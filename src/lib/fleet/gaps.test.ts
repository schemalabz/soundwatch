import { describe, expect, it } from "vitest";
import { discordMessage, evaluate, outageStart, type AlertUnit } from "./alerts";
import { diagnose, type DiagnosisInput } from "./diagnosis";
import { groupBoxes, type TokenRow } from "./inventory";
import { isScheduledBoot, silentCause, watchReasons } from "./status";

const now = new Date("2026-09-29T15:30:00Z");
const healthy: AlertUnit = {
  sensorId: "s1", title: "Skroutz Δάφνη", apName: "Soundwatch-05F3",
  lastReceivedAt: new Date(now.getTime() - 30_000),
  batteryLast: 98, batteryMin1h: 97, batteryMax1h: 98, rssiAvg1h: -53,
  unscheduledBoots24h: 0, routerRestarts24h: 0,
};

describe("alert boundaries", () => {
  it("pages at exactly 30 minutes of silence", () => {
    const d = evaluate([{ ...healthy, lastReceivedAt: new Date(now.getTime() - 30 * 60_000) }], [], now);
    expect(d.open.map((o) => o.kind)).toEqual(["silent"]);
  });
  it("weak signal: −72 does not open (rule is < −72); an open one holds AT −69 (clears only > −69)", () => {
    expect(evaluate([{ ...healthy, rssiAvg1h: -72 }], [], now).open).toEqual([]);
    expect(evaluate([{ ...healthy, rssiAvg1h: -72.4 }], [], now).open.map((o) => o.kind)).toEqual(["weak_signal"]);
    const openWeak = [{ id: 5, sensorId: "s1", kind: "weak_signal" as const }];
    expect(evaluate([{ ...healthy, rssiAvg1h: -69 }], openWeak, now).close).toEqual([]);
    expect(evaluate([{ ...healthy, rssiAvg1h: -68.9 }], openWeak, now).close).toEqual([5]);
  });
});

describe("discordMessage branches", () => {
  const unit = { title: "Skroutz Δάφνη", apName: "Soundwatch-05F3", sensorId: "abcdef1234567890" };
  const embed = (m: { embeds: object[] }) => m.embeds[0] as { title: string; description: string; url?: string; color: number; timestamp: string };
  it("count-based and signal incidents say their number", () => {
    expect(embed(discordMessage({ kind: "router_restarts", cause: null, openedAt: now, closedAt: null, evidence: { count: 3 } }, unit, null)))
      .toMatchObject({ title: "Skroutz Δάφνη (05F3) store router keeps restarting", description: "3 times in the last 24 h." });
    expect(embed(discordMessage({ kind: "weak_signal", cause: null, openedAt: now, closedAt: null, evidence: { rssiAvg1h: -75 } }, unit, null)).description)
      .toBe("-75 dBm average over the last hour.");
  });
  it("no AP name falls back to the first 8 of the sensor id; base URL trailing slash is not doubled", () => {
    const e = embed(discordMessage({ kind: "silent", cause: null, openedAt: now, closedAt: null, evidence: null }, { ...unit, apName: null }, "https://x.gr/"));
    expect(e.title).toBe("Skroutz Δάφνη (abcdef12) is silent");
    expect(e.description).toBe("Cause unknown from the data we have.");
    expect(e.url).toBe("https://x.gr/admin/units/abcdef1234567890");
  });
  it("resolved is green and stamped at closing; open silence red, watch kinds amber", () => {
    const closedAt = new Date(now.getTime() + 3 * 86400_000);
    const r = embed(discordMessage({ kind: "weak_signal", cause: null, openedAt: now, closedAt, evidence: { rssiAvg1h: -75 } }, unit, null));
    expect(r.color).toBe(0x4d8f66);
    expect(r.timestamp).toBe(closedAt.toISOString());
    expect(r.description).toBe("Signal back above -69 dBm (open 3 days).");
    expect(embed(discordMessage({ kind: "silent", cause: null, openedAt: now, closedAt: null, evidence: null }, unit, null)).color).toBe(0xb3362a);
    expect(embed(discordMessage({ kind: "weak_signal", cause: null, openedAt: now, closedAt: null, evidence: null }, unit, null)).color).toBe(0xd1962a);
  });
  it("duration: 89 min stays minutes, 47 h stays hours", () => {
    const at = (ms: number) => embed(discordMessage({ kind: "router_restarts", cause: null, openedAt: now, closedAt: new Date(now.getTime() + ms), evidence: null }, unit, null)).description;
    expect(at(89 * 60_000)).toBe("Fewer than 2 router restarts in the last 24 h (open 89 min).");
    expect(at(47 * 3600_000)).toBe("Fewer than 2 router restarts in the last 24 h (open 47 h).");
  });
  it("outageStart: only a silence reaches back to the last reading", () => {
    const openedAt = new Date("2026-09-29T10:00:00Z");
    expect(outageStart({ kind: "router_restarts", openedAt, evidence: { lastReceivedAt: "2026-09-29T09:00:00Z" } })).toEqual(openedAt);
    expect(outageStart({ kind: "silent", openedAt, evidence: null })).toEqual(openedAt);
  });
});

describe("status boundaries", () => {
  it("−70 dBm exactly is not on watch (rule is < −70)", () => {
    expect(watchReasons({ rssiAvg: -70, unscheduledBoots: 0, routerRestarts: 0 })).toEqual([]);
  });
  it("01:59 UTC is outside the scheduled window", () => {
    expect(isScheduledBoot(new Date("2026-09-29T01:59:00Z"))).toBe(false);
  });
  it("a 2-point battery dip is noise, not draining (needs ≥3)", () => {
    expect(silentCause({ batteryMin: 95, batteryMax: 97, batteryLast: 95 })).toBe("network_lost_powered");
  });
});

describe("inventory: newest token retired, older still active", () => {
  it("current is the active older token, not the retired newer one", () => {
    const row = (deviceId: string, created: string, extra: Partial<TokenRow> = {}): TokenRow => ({
      id: deviceId, deviceId, hardwareId: "X", createdAt: new Date(created), retiredAt: null, isActive: true, isExperimental: false, ...extra,
    });
    const [box] = groupBoxes([row("old", "2026-05-01"), row("new", "2026-10-01", { retiredAt: new Date("2026-10-02"), isActive: false })]);
    expect(box.current.deviceId).toBe("old");
    expect(box.duplicates).toEqual([]);
  });
});

describe("diagnosis edges", () => {
  const base: DiagnosisInput = {
    cause: "network_lost_powered", batteryLast: 98, batteryMin1h: 97, batteryMax1h: 98, rssiLastHour: -72,
    publishFails1h: 0, routerRestartsBefore: [], lastDisconnect: null, unscheduledBootsBefore: 2,
    lastReceivedAt: "2026-09-29T14:54:00Z", brokerRecordsFrom: "2026-09-24T17:50:00Z",
  };
  it("−72 dBm with no failures is still healthy wifi", () => {
    expect(diagnose(base).evidence.find((e) => e.claim.startsWith("Wifi"))?.claim).toBe("Wifi was healthy to the end");
  });
  it("unscheduled restarts without router restarts do not support 'network lost'", () => {
    expect(diagnose(base).evidence.find((e) => e.claim === "2 unscheduled restarts")?.supports).toBe(false);
  });
});

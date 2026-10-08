import { describe, expect, it } from "vitest";
import { discordMessage, evaluate, installMessage, messageLinks, whatToDo, type AlertUnit } from "./alerts";

const now = new Date("2026-09-29T15:30:00Z");
const healthy: AlertUnit = {
  sensorId: "s1", title: "Skroutz Δάφνη", apName: "Soundwatch-05F3",
  lastReceivedAt: new Date(now.getTime() - 30_000),
  batteryLast: 98, batteryMin1h: 97, batteryMax1h: 98, rssiAvg1h: -53,
  unscheduledBoots24h: 0, routerRestarts24h: 0, installedAt: null,
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
  const unit = { title: "Skroutz Δάφνη", apName: "Soundwatch-05F3", sensorId: "abc", latitude: null, longitude: null, latestNote: null };

  it("a silent incident says why and links to the unit", () => {
    const m = discordMessage(
      { kind: "silent", cause: "network_lost_powered", openedAt: now, closedAt: null, evidence: { batteryLast: 98, routerRestarts24h: 2 } },
      unit, "https://soundwatch.gr",
    );
    const e = m.embeds[0] as { title: string; description: string; url: string };
    expect(e.title).toBe("🔴 Skroutz Δάφνη (05F3) is silent");
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
    expect(e.title).toBe("✅ Skroutz Δάφνη (05F3) is back");
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
      { title: "Box D084", apName: "Soundwatch-D084", sensorId: "s1", latitude: null, longitude: null, latestNote: null }, null,
    );
    const text = (msg.embeds[0] as { description: string }).description;
    expect(text).toBe("Fewer than 2 router restarts in the last 24 h (open 23 h).");
  });
});

describe("what to do", () => {
  const silent = (cause: string, ev: Record<string, unknown> = {}) => ({ kind: "silent" as const, cause, evidence: ev });
  it("follows the silent cause", () => {
    expect(whatToDo(silent("network_lost_powered"))).toBe("Ask the store to check its router and internet.");
    expect(whatToDo(silent("on_battery"))).toBe("Check the socket: the unit lost mains power and ran on its battery.");
    expect(whatToDo(silent("unknown", { batteryLast: 2 }))).toBe("Check the unit has power, and charge it: its battery is too low to tell a power cut from an internet outage.");
    expect(whatToDo(silent("unknown", { batteryLast: 80 }))).toBe("Check the unit has power and the store's internet is up.");
  });
  it("a unit that stopped within an hour of installation is a power question", () => {
    expect(whatToDo(silent("unknown", { installedAt: "2026-10-05T10:16:49Z", lastReceivedAt: "2026-10-05T10:16:37Z", batteryLast: 2 })))
      .toBe("Check it is plugged into a socket that has power: it stopped right after installation.");
  });
  it("a unit that stopped long before it was installed is not an installation problem", () => {
    expect(whatToDo(silent("network_lost_powered", { installedAt: "2026-10-05T10:16:49Z", lastReceivedAt: "2026-09-20T08:00:00Z" })))
      .toBe("Ask the store to check its router and internet.");
  });
  it("has a line for every other kind", () => {
    expect(whatToDo({ kind: "router_restarts", cause: null, evidence: null })).toBe("Ask the store about its internet: the router keeps re-dialling.");
    expect(whatToDo({ kind: "unscheduled_restarts", cause: null, evidence: null })).toBe("Check the unit's power supply: it keeps restarting on its own.");
    expect(whatToDo({ kind: "weak_signal", cause: null, evidence: null })).toBe("Ask the store to move the router closer, or add a wifi extender.");
  });
});

describe("links", () => {
  it("admin page and map, each only when known", () => {
    expect(messageLinks({ sensorId: "s1", latitude: 37.95, longitude: 23.74 }, "https://soundwatch.gr/"))
      .toBe("[Open in admin](https://soundwatch.gr/admin/units/s1) · [Map](https://www.google.com/maps?q=37.95,23.74)");
    expect(messageLinks({ sensorId: "s1", latitude: null, longitude: null }, null)).toBe("");
  });
});

it("an open silence carries cause, what to do, when last heard, the latest note and links", () => {
  const msg = discordMessage(
    { kind: "silent", cause: "network_lost_powered", openedAt: new Date("2026-09-28T09:07:27Z"), closedAt: null,
      evidence: { lastReceivedAt: "2026-09-28T08:37:27Z", batteryLast: 99, routerRestarts24h: 2 } },
    { title: "Εκάβης 77, Γαλάτσι", apName: "Soundwatch-0DAE", sensorId: "s1", latitude: 38.0245, longitude: 23.7534,
      latestNote: { body: "Technician: internet off until Thursday", createdAt: new Date("2026-10-05T09:00:00Z") } },
    "https://soundwatch.gr",
  );
  const e = msg.embeds[0] as { title: string; description: string; url: string };
  expect(e.title).toBe("🔴 Εκάβης 77, Γαλάτσι (0DAE) is silent");
  expect(e.url).toBe("https://soundwatch.gr/admin/units/s1");
  expect(e.description).toBe([
    "The store’s internet went away. The sensor still had power.",
    "**What to do:** Ask the store to check its router and internet.",
    "Last heard 28 Sept, 11:37 · battery 99% · the router restarted 2× in the day before",
    "📝 *5 Oct: Technician: internet off until Thursday*",
    "[Open in admin](https://soundwatch.gr/admin/units/s1) · [Map](https://www.google.com/maps?q=38.0245,23.7534)",
  ].join("\n"));
});

it("a resolved silence says the unit is back, with links", () => {
  const msg = discordMessage(
    { kind: "silent", cause: "unknown", openedAt: new Date("2026-10-06T07:28:56Z"), closedAt: new Date("2026-10-08T02:01:00Z"),
      evidence: { lastReceivedAt: "2026-10-06T06:58:56Z" } },
    { title: "Ηπείρου 18, Δάφνη", apName: "Soundwatch-05F3", sensorId: "s2", latitude: null, longitude: null, latestNote: null },
    "https://soundwatch.gr",
  );
  const e = msg.embeds[0] as { title: string; description: string };
  expect(e.title).toBe("✅ Ηπείρου 18, Δάφνη (05F3) is back");
  expect(e.description).toBe("Back after 43 h.\n[Open in admin](https://soundwatch.gr/admin/units/s2)");
});

describe("install announcement", () => {
  const base = {
    title: "Box 4BEF", apName: "Soundwatch-4BEF", sensorId: "s9", latitude: 38.0395, longitude: 23.7559, latestNote: null,
    installedAt: new Date("2026-10-06T07:57:25Z"), siteName: null, address: null,
    batteryLast: 98, rssiLast: -61, lastReceivedAt: new Date("2026-10-06T07:57:10Z"),
  };
  it("says where, that it is sending, and links", () => {
    const e = installMessage(base, "https://soundwatch.gr").embeds[0] as { title: string; description: string; url: string };
    expect(e.title).toBe("🟢 New unit installed: Box 4BEF (4BEF)");
    expect(e.url).toBe("https://soundwatch.gr/admin/units/s9");
    expect(e.description).toBe([
      "Installed 6 Oct, 10:57, by GPS, not linked to a site yet.",
      "Sending: signal -61 dBm · battery 98%",
      "[Open in admin](https://soundwatch.gr/admin/units/s9) · [Map](https://www.google.com/maps?q=38.0395,23.7559)",
    ].join("\n"));
  });
  it("names the site when linked, and warns about a low battery", () => {
    const e = installMessage({ ...base, title: "Skroutz Δάφνη", siteName: "Skroutz Δάφνη", batteryLast: 2 }, null).embeds[0] as { description: string };
    expect(e.description.split("\n")).toEqual([
      "Installed 6 Oct, 10:57, at Skroutz Δάφνη.",
      "Sending: signal -61 dBm · battery 2%",
      "⚠️ Its battery reads 2%: make sure it is on mains power, or it dies the moment it is unplugged.",
      "[Map](https://www.google.com/maps?q=38.0395,23.7559)",
    ]);
  });
  it("says when nothing has arrived yet", () => {
    const e = installMessage({ ...base, lastReceivedAt: null, batteryLast: null, rssiLast: null }, null).embeds[0] as { description: string };
    expect(e.description.split("\n")[1]).toBe("No reading yet. If none arrives within 30 minutes, Echo will say it is silent.");
  });
});

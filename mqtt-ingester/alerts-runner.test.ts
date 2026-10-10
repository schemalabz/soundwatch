import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runAlertsOnce } from "./alerts";

// In-memory stand-in for the four Prisma calls runAlertsOnce makes. Enforces
// incidents_one_open like the database (P2002 on a second open (unit, kind)).
type Inc = {
  id: bigint; sensorId: string; kind: string; openedAt: Date; closedAt: Date | null; cause: string | null;
  evidence: Record<string, unknown> | null; notifiedAt: Date | null; resolvedNotifiedAt: Date | null; openSlot: boolean | null;
};
const NOW = new Date("2026-09-29T15:30:00Z");
const sensor = { apName: "Soundwatch-05F3", name: "Skroutz Δάφνη", address: null, deviceId: "tok1", plannedLocation: null, latitude: null, longitude: null, notes: [] };

// In-memory stand-in for the sensors table, as announceInstalls sees it
// (plus a `lastReading` field the fake's $queryRaw uses — see below).
type FakeSensor = {
  id: string; name: string | null; address: string | null; apName: string | null; deviceId: string;
  latitude: number | null; longitude: number | null;
  installedAt: Date | null; installAnnouncedAt: Date | null; retiredAt: Date | null; isExperimental: boolean;
  plannedLocation: { name: string } | null; notes: { body: string; createdAt: Date }[];
  lastReading: { battery: number | null; rssi: number | null; received_at: Date } | null;
};
const fakeSensor = (over: Partial<FakeSensor> & { id: string }): FakeSensor => ({
  name: null, address: null, apName: "Soundwatch-05F3", deviceId: "tok-x",
  latitude: 38.0, longitude: 23.7, installedAt: null, installAnnouncedAt: null, retiredAt: null, isExperimental: false,
  plannedLocation: null, notes: [], lastReading: null,
  ...over,
});

function fakeDb(unitRows: object[], incidents: Inc[] = [], sensors: FakeSensor[] = []) {
  let nextId = BigInt(100);
  const apply = (i: Inc, data: Partial<Inc>) => Object.assign(i, data);
  const db = {
    incidents,
    sensors,
    // gather()'s unit-row query and announceInstalls()'s latest-reading query
    // both touch "FROM readings" (gather joins it twice), so that substring
    // alone cannot tell them apart. "rssi, received_at" (that exact column
    // order) appears only in announceInstalls' query, so it is the marker
    // used to route each call to the right in-memory answer.
    $queryRaw: vi.fn(async (strings: readonly string[], ...values: unknown[]) => {
      if (strings.join("").includes("rssi, received_at")) {
        const s = sensors.find((x) => x.id === values[0]);
        return s?.lastReading ? [s.lastReading] : [];
      }
      return unitRows;
    }),
    sensor: {
      findMany: vi.fn(async ({ where }: { where: { installedAt: { lte: Date }; installAnnouncedAt: null; retiredAt: null; isExperimental: false } }) =>
        sensors.filter((s) =>
          s.installedAt != null && s.installedAt <= where.installedAt.lte &&
          s.installAnnouncedAt === where.installAnnouncedAt &&
          s.retiredAt === where.retiredAt &&
          s.isExperimental === where.isExperimental)),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; installAnnouncedAt: null }; data: Partial<FakeSensor> }) => {
        const s = sensors.find((x) => x.id === where.id);
        if (!s || s.installAnnouncedAt !== where.installAnnouncedAt) return { count: 0 };
        Object.assign(s, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeSensor> }) =>
        Object.assign(sensors.find((x) => x.id === where.id)!, data)),
    },
    incident: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        if ("closedAt" in args.where) return incidents.filter((i) => i.closedAt === null);
        return incidents
          .filter((i) => i.notifiedAt === null || (i.closedAt !== null && i.resolvedNotifiedAt === null))
          .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime())
          .map((i) => ({ ...i, sensor }));
      }),
      create: vi.fn(async ({ data }: { data: Partial<Inc> }) => {
        if (incidents.some((i) => i.sensorId === data.sensorId && i.kind === data.kind && i.openSlot === true)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const row: Inc = { id: nextId++, closedAt: null, cause: null, evidence: null, notifiedAt: null, resolvedNotifiedAt: null, openSlot: true, ...data } as Inc;
        incidents.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: bigint | { in: bigint[] }; notifiedAt?: null; resolvedNotifiedAt?: null }; data: Partial<Inc> }) => {
        const ids = typeof where.id === "bigint" ? [where.id] : where.id.in;
        let count = 0;
        for (const i of incidents) {
          if (!ids.includes(i.id)) continue;
          if ("notifiedAt" in where && i.notifiedAt !== null) continue;
          if ("resolvedNotifiedAt" in where && i.resolvedNotifiedAt !== null) continue;
          apply(i, data); count++;
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: bigint }; data: Partial<Inc> }) => apply(incidents.find((i) => i.id === where.id)!, data)),
    },
  };
  return db;
}
const asPrisma = (db: unknown) => db as PrismaClient;

const unitRow = (over: Record<string, unknown> = {}) => ({
  sensor_id: "s1", title: "Skroutz Δάφνη", ap_name: "Soundwatch-05F3",
  last_at: new Date(NOW.getTime() - 30_000), battery: 98, bmin: 97, bmax: 98, rssi_avg: -53,
  boots_24h: BigInt(0), router_24h: BigInt(0), installed_at: null, ...over,
});
const inc = (over: Partial<Inc>): Inc => ({
  id: BigInt(1), sensorId: "s1", kind: "silent", openedAt: new Date(NOW.getTime() - 3600_000), closedAt: null, cause: null,
  evidence: null, notifiedAt: new Date(NOW.getTime() - 3500_000), resolvedNotifiedAt: null, openSlot: true, ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  process.env.DISCORD_WEBHOOK_URL = "https://discord.example/hook";
  delete process.env.ADMIN_BASE_URL;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.DISCORD_WEBHOOK_URL; });

describe("runAlertsOnce", () => {
  it("opens a silence dated last reading + 30 min, delivers once, records the delivery", async () => {
    const db = fakeDb([unitRow({ last_at: new Date(NOW.getTime() - 3600_000) })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents).toHaveLength(1);
    expect(db.incidents[0]).toMatchObject({ kind: "silent", cause: "network_lost_powered", openedAt: new Date(NOW.getTime() - 1800_000), notifiedAt: NOW });
    expect(db.incidents[0].evidence).toMatchObject({ delivery: "discord" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await runAlertsOnce(asPrisma(db), NOW); // second tick: nothing new to say
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bigint counts from SQL reach the rules (router_24h 2n opens router_restarts)", async () => {
    const db = fakeDb([unitRow({ router_24h: BigInt(2) })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents.map((i) => i.kind)).toEqual(["router_restarts"]);
    expect(db.incidents[0].evidence).toMatchObject({ count: 2 }); // a number, not 2n: JSON evidence cannot hold a bigint
  });

  it("closing frees the open slot and announces the unit is back exactly once", async () => {
    const db = fakeDb([unitRow()], [inc({})]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents[0]).toMatchObject({ closedAt: NOW, openSlot: null, resolvedNotifiedAt: NOW });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain("is back");
    // the slot is free: the same unit can go silent again and open a new incident
    db.$queryRaw.mockResolvedValue([unitRow({ last_at: new Date(NOW.getTime() - 3600_000) })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents.filter((i) => i.closedAt === null)).toHaveLength(1);
  });

  it("a unit that left the evaluation is closed quietly: no 'resolved' message", async () => {
    const db = fakeDb([], [inc({ sensorId: "gone" })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents[0]).toMatchObject({ closedAt: NOW, resolvedNotifiedAt: NOW, openSlot: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opened and closed before ever being announced: marked, never sent", async () => {
    const db = fakeDb([unitRow()], [inc({ notifiedAt: null })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents[0]).toMatchObject({ notifiedAt: NOW, resolvedNotifiedAt: NOW });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed Discord delivery is retried next tick, not marked delivered", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const db = fakeDb([unitRow({ last_at: null })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents[0].notifiedAt).toBeNull();
    await runAlertsOnce(asPrisma(db), NOW);
    expect(db.incidents[0].notifiedAt).toEqual(NOW);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("without a webhook it is a dry run, marked so it is not replayed later", async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    const db = fakeDb([unitRow({ last_at: null })]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.incidents[0].notifiedAt).toEqual(NOW);
    expect(db.incidents[0].evidence).toMatchObject({ delivery: "dry-run" });
  });

  it("losing the open race (P2002) is swallowed; any other DB error propagates", async () => {
    const db = fakeDb([unitRow({ last_at: null })]);
    db.incident.findMany.mockResolvedValueOnce([]); // evaluator saw nothing open...
    db.incidents.push(inc({ id: BigInt(50), openedAt: NOW })); // ...but another evaluator opened it
    await expect(runAlertsOnce(asPrisma(db), NOW)).resolves.toBeUndefined();
    const db2 = fakeDb([unitRow({ last_at: null })]);
    db2.incident.create.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "P1001" }));
    await expect(runAlertsOnce(asPrisma(db2), NOW)).rejects.toThrow("boom");
  });

  it("an incident claimed by another evaluator is not posted again", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook";
    const posted = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", posted);
    const inc: Inc = { id: BigInt(1), sensorId: "s1", kind: "silent", openedAt: NOW, closedAt: null, cause: "unknown", evidence: {}, notifiedAt: null, resolvedNotifiedAt: null, openSlot: true };
    const db = fakeDb([unitRow({ last_at: new Date(NOW.getTime() - 3600_000) })], [inc]);
    // The other evaluator wins the claim between our read and our post:
    db.incident.findMany.mockImplementationOnce(async () => [inc]).mockImplementationOnce(async () => { const r = [{ ...inc, sensor }]; inc.notifiedAt = NOW; return r; });
    await runAlertsOnce(asPrisma(db), NOW);
    expect(posted).not.toHaveBeenCalled();
  });

  it("the delivery-after-failure branch claims notifiedAt AND resolvedNotifiedAt before posting, not after — closing the window a second evaluator could race through", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook";
    const inc: Inc = { id: BigInt(1), sensorId: "s1", kind: "silent", openedAt: new Date(NOW.getTime() - 7200_000), closedAt: new Date(NOW.getTime() - 600_000), cause: "unknown",
      evidence: { deliveryFailedAt: new Date(NOW.getTime() - 3600_000).toISOString() },
      notifiedAt: null, resolvedNotifiedAt: null, openSlot: null };
    const db = fakeDb([unitRow()], [inc]);
    let stateDuringPost: { notifiedAt: Date | null; resolvedNotifiedAt: Date | null } | null = null;
    vi.stubGlobal("fetch", vi.fn(async () => {
      // Snapshot the row at the moment Discord is actually being told — if
      // only notifiedAt is claimed by then, a second evaluator reading in
      // this window sees resolving=true and posts "resolved" again.
      stateDuringPost = { notifiedAt: db.incidents[0].notifiedAt, resolvedNotifiedAt: db.incidents[0].resolvedNotifiedAt };
      return new Response(null, { status: 204 });
    }));
    await runAlertsOnce(asPrisma(db), NOW);
    expect(stateDuringPost).toEqual({ notifiedAt: NOW, resolvedNotifiedAt: NOW });
  });

  it("an incident in the delivery-after-failure branch already claimed by another evaluator is not posted again", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook";
    const posted = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", posted);
    const inc: Inc = { id: BigInt(1), sensorId: "s1", kind: "silent", openedAt: new Date(NOW.getTime() - 7200_000), closedAt: new Date(NOW.getTime() - 600_000), cause: "unknown",
      evidence: { deliveryFailedAt: new Date(NOW.getTime() - 3600_000).toISOString() },
      notifiedAt: null, resolvedNotifiedAt: null, openSlot: null };
    const db = fakeDb([unitRow()], [inc]);
    // The other evaluator wins the combined claim between our read and our write:
    db.incident.findMany
      .mockImplementationOnce(async () => []) // already closed: nothing in the open list
      .mockImplementationOnce(async () => { const r = [{ ...inc, sensor }]; inc.notifiedAt = NOW; inc.resolvedNotifiedAt = NOW; return r; });
    await runAlertsOnce(asPrisma(db), NOW);
    expect(posted).not.toHaveBeenCalled();
  });

  it("an outage that opened and closed while Discord was down is announced once, as back", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook";
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { bodies.push(String(init.body)); return new Response(null, { status: 204 }); }));
    const inc: Inc = { id: BigInt(1), sensorId: "s1", kind: "silent", openedAt: new Date(NOW.getTime() - 7200_000), closedAt: new Date(NOW.getTime() - 600_000), cause: "unknown",
      evidence: { lastReceivedAt: new Date(NOW.getTime() - 9000_000).toISOString(), deliveryFailedAt: new Date(NOW.getTime() - 3600_000).toISOString() },
      notifiedAt: null, resolvedNotifiedAt: null, openSlot: null };
    await runAlertsOnce(asPrisma(fakeDb([unitRow()], [inc])), NOW);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("is back");
    expect(inc.notifiedAt).toEqual(NOW);
    expect(inc.resolvedNotifiedAt).toEqual(NOW);
  });

  it("announces a new install once, and never a bench unit", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook";
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { bodies.push(String(init.body)); return new Response(null, { status: 204 }); }));
    // fresh: installed, not announced; bench: experimental; old: already announced
    const fresh = fakeSensor({ id: "fresh", installedAt: new Date(NOW.getTime() - 60_000) });
    const bench = fakeSensor({ id: "bench", installedAt: new Date(NOW.getTime() - 60_000), isExperimental: true });
    const old = fakeSensor({ id: "old", installedAt: new Date(NOW.getTime() - 86_400_000), installAnnouncedAt: new Date(NOW.getTime() - 86_000_000) });
    const db = fakeDb([], [], [fresh, bench, old]);
    await runAlertsOnce(asPrisma(db), NOW);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("New unit installed");
    expect(fresh.installAnnouncedAt).toEqual(NOW);
  });

  it("gives the install back when Discord fails, so the next tick retries", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const fresh = fakeSensor({ id: "fresh", installedAt: new Date(NOW.getTime() - 60_000) });
    const db = fakeDb([], [], [fresh]);
    await runAlertsOnce(asPrisma(db), NOW);
    expect(fresh.installAnnouncedAt).toBeNull();
  });

  it("install announcements fail gracefully, so incident alerts are still evaluated", async () => {
    const db = fakeDb([unitRow({ last_at: new Date(NOW.getTime() - 3600_000) })]);
    db.sensor.findMany.mockRejectedValueOnce(new Error("db down"));
    // announceInstalls throws, but runAlertsOnce must resolve and still open the silent incident
    await expect(runAlertsOnce(asPrisma(db), NOW)).resolves.toBeUndefined();
    expect(db.incidents).toHaveLength(1);
    expect(db.incidents[0]).toMatchObject({ kind: "silent", cause: "network_lost_powered" });
  });
});

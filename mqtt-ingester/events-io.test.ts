import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importBrokerEvents, parseBrokerLine, recordBootIfAny, tailBrokerLog } from "./events";

const L = (hhmmss: string, ip: string, id = "tok1") => `2026-09-29T${hhmmss}+0000: New client connected from ${ip}:5000 as ${id} (p4, c1, k120).\n`;

function fakeDb() {
  const stored: { sensorId: string; kind: string; at: Date; detail: unknown }[] = [];
  const db = {
    stored,
    sensor: { findMany: vi.fn(async ({ where }: { where: { deviceId: { in: string[] } } }) =>
      where.deviceId.in.filter((d) => d.startsWith("tok")).map((d) => ({ id: `s-${d}`, deviceId: d }))) },
    deviceEvent: { createMany: vi.fn(async ({ data }: { data: typeof stored }) => {
      let n = 0;
      for (const r of data) if (!stored.some((s) => s.sensorId === r.sensorId && s.kind === r.kind && +s.at === +r.at)) { stored.push(r); n++; }
      return { count: n };
    }) },
    $queryRaw: vi.fn(),
  };
  return db;
}
const P = (db: unknown) => db as PrismaClient;

beforeEach(() => {
  process.env.IP_LOOKUP = "off";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("importBrokerEvents", () => {
  it("keeps only known devices; connect stores ip, disconnect ip + reason", async () => {
    const db = fakeDb();
    const events = [
      L("08:00:00", "1.1.1.1"), L("08:00:01", "9.9.9.9", "nmap"),
      "2026-09-29T09:00:00+0000: Client tok1 [1.1.1.1:5000] disconnected: exceeded timeout.\n",
    ].map((l) => parseBrokerLine(l.trimEnd())!);
    expect(await importBrokerEvents(P(db), events)).toBe(2);
    expect(db.stored.map((s) => [s.sensorId, s.kind, s.detail])).toEqual([
      ["s-tok1", "connect", { ip: "1.1.1.1" }],
      ["s-tok1", "disconnect", { ip: "1.1.1.1", reason: "exceeded timeout" }],
    ]);
  });
});

describe("tailBrokerLog", () => {
  let stop = () => {};
  afterEach(() => stop());
  const file = () => join(mkdtempSync(join(tmpdir(), "brokerlog-")), "mosquitto.log");

  it("reads only whole lines; a line still being written is picked up once complete", async () => {
    const db = fakeDb(); const f = file();
    const third = L("08:00:02", "3.3.3.3");
    writeFileSync(f, L("08:00:00", "1.1.1.1") + L("08:00:01", "2.2.2.2") + third.slice(0, 30));
    stop = tailBrokerLog(P(db), f, 15);
    await vi.waitFor(() => expect(db.stored).toHaveLength(2));
    appendFileSync(f, third.slice(30));
    await vi.waitFor(() => expect(db.stored.map((s) => (s.detail as { ip: string }).ip)).toEqual(["1.1.1.1", "2.2.2.2", "3.3.3.3"]));
  });

  it("a database error does not advance the position: the same bytes are retried", async () => {
    const db = fakeDb(); const f = file();
    writeFileSync(f, L("08:00:00", "1.1.1.1"));
    db.deviceEvent.createMany.mockRejectedValueOnce(new Error("db down"));
    stop = tailBrokerLog(P(db), f, 15);
    await vi.waitFor(() => expect(db.stored).toHaveLength(1));
    expect(db.deviceEvent.createMany.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("a file that shrank (rotated) is read again from the top", async () => {
    const db = fakeDb(); const f = file();
    writeFileSync(f, L("08:00:00", "1.1.1.1") + L("08:00:01", "2.2.2.2"));
    stop = tailBrokerLog(P(db), f, 15);
    await vi.waitFor(() => expect(db.stored).toHaveLength(2));
    writeFileSync(f, L("09:00:00", "4.4.4.4"));
    await vi.waitFor(() => expect(db.stored).toHaveLength(3));
  });
});

describe("recordBootIfAny", () => {
  const received = new Date("2026-09-29T08:58:40Z");
  const prev = (up: number, at: string) => [{ up, received_at: new Date(at) }];

  it("a real restart is stored at server time minus uptime, flagged unscheduled", async () => {
    const db = fakeDb();
    db.$queryRaw.mockResolvedValue(prev(20230, "2026-09-29T08:58:10Z"));
    const createMany = vi.fn(async () => ({ count: 1 }));
    (db.deviceEvent as unknown as { createMany: typeof createMany }).createMany = createMany;
    await recordBootIfAny(P(db), "s1", { recordedAt: new Date("2026-09-29T08:40:00Z"), deviceUptimeS: 64, resetCause: 3 }, received);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ sensorId: "s1", kind: "boot", at: new Date("2026-09-29T08:57:36Z"),
        detail: { uptimeBefore: 20230, resetCause: 3, scheduled: false }, source: "ingester" }],
      skipDuplicates: true,
    });
  });

  it("a backlog row (arrived > 30 min after it was recorded) is never compared", async () => {
    const db = fakeDb();
    await recordBootIfAny(P(db), "s1", { recordedAt: new Date("2026-09-29T07:00:00Z"), deviceUptimeS: 64 }, received);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.deviceEvent.createMany).not.toHaveBeenCalled();
  });

  it("a replayed row from the same boot, or no previous row, records nothing", async () => {
    const db = fakeDb();
    db.$queryRaw.mockResolvedValueOnce(prev(20300, "2026-09-29T08:58:35Z"));
    await recordBootIfAny(P(db), "s1", { recordedAt: received, deviceUptimeS: 20000 }, received);
    db.$queryRaw.mockResolvedValueOnce([]);
    await recordBootIfAny(P(db), "s1", { recordedAt: received, deviceUptimeS: 64 }, received);
    expect(db.deviceEvent.createMany).not.toHaveBeenCalled();
  });
});

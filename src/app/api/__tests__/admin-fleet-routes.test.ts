import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), update: vi.fn() },
    plannedLocation: { findUnique: vi.fn() },
    unitNote: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { PATCH as patchSensor } from "../admin/sensors/[id]/route";
import { POST as retire } from "../admin/sensors/[id]/retire/route";
import { POST as site } from "../admin/sensors/[id]/site/route";
import { POST as addNote } from "../admin/units/[id]/notes/route";
import { DELETE as deleteNote } from "../admin/units/[id]/notes/[noteId]/route";

const m = vi.mocked(prisma, true);
const AUTH = { authorization: "Bearer secret", "content-type": "application/json" };
const req = (body: unknown) => new Request("https://soundwatch.gr/x", { method: "POST", headers: AUTH, body: JSON.stringify(body) });
const ctx = (id = "s1") => ({ params: Promise.resolve({ id }) });
const SENSOR = { id: "s1", deviceId: "tok1", hardwareId: "CHIP1", isActive: true, retiredAt: null, activeBeforeRetire: null,
  latitude: 37.91, longitude: 23.72, installedAt: new Date("2026-08-28T12:00:00Z"), name: null, address: null };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  m.sensor.update.mockImplementation((async (a: { data: object }) => ({ ...SENSOR, ...a.data })) as never);
});

describe("retire / undo", () => {
  it("retiring remembers whether the unit was public", async () => {
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, isActive: false } as never);
    expect((await retire(req({}), ctx())).status).toBe(200);
    expect(m.sensor.update.mock.calls[0][0].data).toMatchObject({ isActive: false, activeBeforeRetire: false, supersededById: null });
  });
  it("undo restores is_active as it was: a unit hidden before retirement stays hidden", async () => {
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, retiredAt: new Date(), isActive: false, activeBeforeRetire: false } as never);
    await retire(req({ undo: true }), ctx());
    expect(m.sensor.update.mock.calls[0][0].data).toEqual({ retiredAt: null, supersededById: null, isActive: false, activeBeforeRetire: null });
  });
  it("undo of a retirement made before active_before_retire existed falls back to public", async () => {
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, retiredAt: new Date(), isActive: false, activeBeforeRetire: null } as never);
    await retire(req({ undo: true }), ctx());
    expect(m.sensor.update.mock.calls[0][0].data).toMatchObject({ isActive: true });
  });
  it("409 on undo of a live unit and on retiring twice; 400 superseding itself; 409 a different chip", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    expect((await retire(req({ undo: true }), ctx())).status).toBe(409);
    expect((await retire(req({ supersededById: "s1" }), ctx())).status).toBe(400);
    m.sensor.findUnique.mockImplementation((async (a: { where: { id: string } }) =>
      a.where.id === "s1" ? SENSOR : { ...SENSOR, id: "s2", hardwareId: "CHIP2" }) as never);
    expect((await retire(req({ supersededById: "s2" }), ctx())).status).toBe(409);
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, retiredAt: new Date() } as never);
    expect((await retire(req({}), ctx())).status).toBe(409);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });
  it('{"undo":"false"} is a 400, not an undo', async () => {
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, retiredAt: new Date() } as never);
    expect((await retire(req({ undo: "false" }), ctx())).status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });
  it("a null body is a 400, not a 500", async () => {
    const res = await retire(new Request("https://x/y", { method: "POST", headers: AUTH, body: "null" }), ctx());
    expect(res.status).toBe(400);
  });
});

describe("link to a site", () => {
  const P = { id: "p1", name: "Skroutz Δάφνη", address: "Δάφνη 1", latitude: 37.9, longitude: 23.7, isActive: true, sensors: [] as object[] };
  it("copies name and address, keeps the unit's own GPS, never touches installed_at", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    m.plannedLocation.findUnique.mockResolvedValue(P as never);
    expect((await site(req({ siteId: "p1" }), ctx())).status).toBe(200);
    expect(m.sensor.update.mock.calls[0][0].data).toEqual({ plannedLocationId: "p1", name: "Skroutz Δάφνη", address: "Δάφνη 1" });
  });
  it("a unit with no GPS takes the site's coordinates", async () => {
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, latitude: null, longitude: null } as never);
    m.plannedLocation.findUnique.mockResolvedValue(P as never);
    await site(req({ siteId: "p1" }), ctx());
    expect(m.sensor.update.mock.calls[0][0].data).toMatchObject({ latitude: 37.9, longitude: 23.7 });
  });
  it("an occupied site is a 409 naming the occupant unless acceptOccupied; a retired occupant does not count", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    m.plannedLocation.findUnique.mockResolvedValue({ ...P, sensors: [{ deviceId: "other", retiredAt: null, isActive: true }] } as never);
    const r = await site(req({ siteId: "p1" }), ctx());
    expect(r.status).toBe(409);
    expect((await r.json()).occupiedBy).toEqual(["other"]);
    expect((await site(req({ siteId: "p1", acceptOccupied: true }), ctx())).status).toBe(200);
    m.plannedLocation.findUnique.mockResolvedValue({ ...P, sensors: [{ deviceId: "old", retiredAt: new Date(), isActive: false }] } as never);
    expect((await site(req({ siteId: "p1" }), ctx())).status).toBe(200);
  });
  it("custom with empty coordinates is a 400, never 0,0", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await site(req({ custom: { name: "X", latitude: 0, longitude: 0 } }), ctx());
    expect(res.status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });
  it("exactly one of siteId, custom, unlink", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    expect((await site(req({ siteId: "p1", unlink: true }), ctx())).status).toBe(400);
  });
  it("movePin puts the unit on the site's position", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    m.plannedLocation.findUnique.mockResolvedValue({ id: "p1", name: "Δάφνη", address: "Ηπείρου 18", latitude: 37.9545, longitude: 23.7408, isActive: true, sensors: [] } as never);
    await site(req({ siteId: "p1", movePin: true }), ctx());
    expect(m.sensor.update.mock.calls[0][0].data).toMatchObject({ latitude: 37.9545, longitude: 23.7408 });
  });
  it("linking to a site whose address is null writes address: null onto the unit", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    m.plannedLocation.findUnique.mockResolvedValue({ id: "p1", name: "Δάφνη", address: null, latitude: 37.9545, longitude: 23.7408, isActive: true, sensors: [] } as never);
    await site(req({ siteId: "p1" }), ctx());
    expect(m.sensor.update.mock.calls[0][0].data).toMatchObject({ address: null, name: "Δάφνη" });
  });
});

describe("notes", () => {
  it("whitespace-only and over-long bodies are 400; the body is trimmed", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    m.unitNote.create.mockImplementation((async (a: { data: { body: string } }) => ({ id: BigInt(7), body: a.data.body, createdAt: new Date(0) })) as never);
    expect((await addNote(req({ body: "   " }), ctx())).status).toBe(400);
    expect((await addNote(req({ body: "x".repeat(2001) }), ctx())).status).toBe(400);
    const r = await addNote(req({ body: "  router swapped  " }), ctx());
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: "7", body: "router swapped", createdAt: new Date(0).toISOString() });
  });
  it("delete is scoped to the unit in the URL and rejects a non-numeric id", async () => {
    const del = (noteId: string) => deleteNote(new Request("https://x", { method: "DELETE", headers: AUTH }), { params: Promise.resolve({ id: "s1", noteId }) });
    expect((await del("abc")).status).toBe(400);
    m.unitNote.deleteMany.mockResolvedValue({ count: 0 } as never);
    expect((await del("7")).status).toBe(404);
    expect(m.unitNote.deleteMany).toHaveBeenCalledWith({ where: { id: BigInt(7), sensorId: "s1" } });
  });
});

describe("sensor PATCH", () => {
  it("a retired token cannot be made public through PATCH", async () => {
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, retiredAt: new Date(), isActive: false } as never);
    const res = await patchSensor(new Request("https://x/y", { method: "PATCH", headers: AUTH, body: JSON.stringify({ isActive: true }) }), ctx());
    expect(res.status).toBe(409);
  });
  it("PATCH coordinates must be real", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await patchSensor(new Request("https://x/y", { method: "PATCH", headers: AUTH, body: JSON.stringify({ latitude: "", longitude: "" }) }), ctx());
    expect(res.status).toBe(400);
  });
  it("a null body is a 400, not a 500", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await patchSensor(new Request("https://x/y", { method: "PATCH", headers: AUTH, body: "null" }), ctx());
    expect(res.status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });
  it("a wrongly-typed field is a 400", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await patchSensor(new Request("https://x/y", { method: "PATCH", headers: AUTH, body: JSON.stringify({ isActive: "true" }) }), ctx());
    expect(res.status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });
});

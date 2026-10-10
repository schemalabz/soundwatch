import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), update: vi.fn() },
    plannedLocation: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { POST as locate } from "../install/[token]/location/route";

const m = vi.mocked(prisma, true);
const req = (body: unknown) => new Request("https://soundwatch.gr/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (token = "tok1") => ({ params: Promise.resolve({ token }) });
const SENSOR = { deviceId: "tok1", latitude: null, longitude: null, name: null, address: null, plannedLocationId: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.sensor.update.mockImplementation((async (a: { data: object }) => ({ ...SENSOR, ...a.data })) as never);
});

describe("POST /api/install/[token]/location", () => {
  it("a non-string name is a 400", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await locate(req({ latitude: 37.9, longitude: 23.7, name: 42 }), ctx());
    expect(res.status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });

  it("a name longer than 120 characters is a 400", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await locate(req({ latitude: 37.9, longitude: 23.7, name: "x".repeat(121) }), ctx());
    expect(res.status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });

  it("an address longer than 200 characters is a 400", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await locate(req({ latitude: 37.9, longitude: 23.7, address: "x".repeat(201) }), ctx());
    expect(res.status).toBe(400);
    expect(m.sensor.update).not.toHaveBeenCalled();
  });

  it("a valid name and address for an unlocated sensor writes both, trimmed", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await locate(req({ latitude: 37.9, longitude: 23.7, name: "  Κυδωνιών 34, Νέα Ιωνία  ", address: "  Κυδωνιών 34, 142 34 Νέα Ιωνία  " }), ctx());
    expect(res.status).toBe(200);
    expect(m.sensor.update.mock.calls[0][0].data).toMatchObject({
      name: "Κυδωνιών 34, Νέα Ιωνία",
      address: "Κυδωνιών 34, 142 34 Νέα Ιωνία",
    });
  });

  it("whitespace-only name and address for an unlocated sensor writes neither (treated as absent, not a 400)", async () => {
    m.sensor.findUnique.mockResolvedValue(SENSOR as never);
    const res = await locate(req({ latitude: 37.9, longitude: 23.7, name: "   ", address: "  " }), ctx());
    expect(res.status).toBe(200);
    const data = m.sensor.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("address");
  });
});

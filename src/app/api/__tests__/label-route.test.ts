import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { sensor: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { GET } from "../admin/sensors/[id]/label/route";
import { renderLabel } from "@/lib/label/render";

const mocked = vi.mocked(prisma, true);
const SENSOR = {
  id: "c1",
  deviceId: "z57ksukdg7hp9td6",
  name: null,
  apName: "Soundwatch-0604",
  hardwareId: "6A2A71F50305247522E3120FF0D0226",
  plannedLocation: null,
};

function call(headers: Record<string, string> = {}) {
  return GET(new Request(`https://soundwatch.gr/api/admin/sensors/${SENSOR.deviceId}/label`, { headers }), {
    params: Promise.resolve({ id: SENSOR.deviceId }),
  });
}
const AUTH = { authorization: "Bearer secret" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  mocked.sensor.findUnique.mockResolvedValue(SENSOR as never);
});

describe("label route", () => {
  it("requires the admin token", async () => {
    expect((await call()).status).toBe(401);
    expect(mocked.sensor.findUnique).not.toHaveBeenCalled();
  });

  it("looks the sensor up by device token, not row id", async () => {
    await call(AUTH);
    expect(mocked.sensor.findUnique).toHaveBeenCalledWith({
      where: { deviceId: SENSOR.deviceId },
      include: { plannedLocation: { select: { name: true } } },
    });
  });

  it("404s an unknown token", async () => {
    mocked.sensor.findUnique.mockResolvedValue(null as never);
    expect((await call(AUTH)).status).toBe(404);
  });

  it("409s an unprovisioned sensor — a label without the setup AP strands the installer", async () => {
    mocked.sensor.findUnique.mockResolvedValue({ ...SENSOR, apName: null } as never);
    const res = await call(AUTH);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not provisioned");
  });

  // Byte-equal to the renderer's own output for the expected fields, so the
  // name rule and every passed-through field are pinned, not just "differs".
  async function printed(row: object) {
    mocked.sensor.findUnique.mockResolvedValue({ ...SENSOR, ...row } as never);
    return Buffer.from(await (await call(AUTH)).arrayBuffer());
  }
  const expected = (name: string | null) =>
    renderLabel({ deviceId: SENSOR.deviceId, name, apName: SENSOR.apName, hardwareId: SENSOR.hardwareId });

  it("prints the site name over the unit's own name, like the admin inventory", async () => {
    const png = await printed({ name: "Bench 2", plannedLocation: { name: "Skroutz Δάφνη" } });
    expect(png.equals(await expected("Skroutz Δάφνη"))).toBe(true);
  });

  it("falls back to the unit's own name when it has no site", async () => {
    const png = await printed({ name: "Bench 2", plannedLocation: null });
    expect(png.equals(await expected("Bench 2"))).toBe(true);
  });

  it("returns the PNG, uncached, named after the token", async () => {
    const res = await call(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="label-${SENSOR.deviceId}.png"`);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});

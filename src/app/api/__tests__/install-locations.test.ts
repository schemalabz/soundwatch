import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn() },
    plannedLocation: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { GET as locations } from "../install/[token]/locations/route";

const m = vi.mocked(prisma, true);
const ctx = (token = "tok1") => ({ params: Promise.resolve({ token }) });
const ago = (ms: number) => new Date(Date.now() - ms);
const OCCUPANT = { deviceId: "other", retiredAt: null, isActive: true, isExperimental: false, provisionedAt: ago(30 * 86_400_000),
  handedOverAt: null, installedAt: ago(20 * 86_400_000), lastSeenAt: ago(60_000) };
const site = (sensors: object[]) => ({ id: "p1", name: "Skroutz Χαλάνδρι", latitude: 38.02, longitude: 23.8, address: null, sensors });

async function occupied(sensors: object[]) {
  m.plannedLocation.findMany.mockResolvedValue([site(sensors)] as never);
  const body = await (await locations(new Request("https://soundwatch.gr/x"), ctx())).json();
  return body.locations[0].occupied;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.sensor.findUnique.mockResolvedValue({ deviceId: "tok1" } as never);
});

// The occupant's state comes from the fleet's own rule (lib/fleet/status), so
// the installer and the admin call the same box the same thing.
describe("GET /api/install/[token]/locations: occupied", () => {
  it("an installed occupant heard recently is live", async () => {
    expect(await occupied([OCCUPANT])).toEqual({ state: "live" });
  });
  it("an installed occupant quiet past the fleet's silent bound is silent", async () => {
    expect(await occupied([{ ...OCCUPANT, lastSeenAt: ago(60 * 60_000) }])).toEqual({ state: "silent" });
  });
  it("a boxed occupant with a recent office check is not live", async () => {
    expect(await occupied([{ ...OCCUPANT, installedAt: null }])).toEqual({ state: "silent" });
  });
  it("a retired or hidden occupant, or this unit itself, occupies nothing", async () => {
    expect(await occupied([{ ...OCCUPANT, retiredAt: ago(1000) }])).toBeNull();
    expect(await occupied([{ ...OCCUPANT, isActive: false }])).toBeNull();
    expect(await occupied([{ ...OCCUPANT, deviceId: "tok1" }])).toBeNull();
  });
});

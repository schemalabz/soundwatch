import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), findMany: vi.fn() },
    reading: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { readingRow } from "@/lib/api/fixtures";
import { SensorDetailSchema } from "@/lib/api/schemas";
import { GET } from "../sensors/[id]/route";

const mocked = vi.mocked(prisma, true);

const DB_SENSOR = {
  id: "s1",
  deviceId: "5hvdyx9a8gkxd4aa",
  name: "Skroutz Store 1",
  latitude: 37.98,
  longitude: 23.73,
  address: "Athens",
  firmwareVersion: "1.0",
  readingIntervalS: 30,
  isActive: true,
  isExperimental: false,
  lastSeenAt: new Date("2026-08-12T10:00:10Z"),
  createdAt: new Date("2026-07-01T00:00:00Z"),
  readings: [readingRow()],
};

function call(headers: Record<string, string> = {}) {
  return GET(new Request("http://test/api/sensors/s1", { headers }), {
    params: Promise.resolve({ id: "s1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  mocked.sensor.findUnique.mockResolvedValue(DB_SENSOR as never);
});

describe("GET /api/sensors/[id]", () => {
  it("returns the widened latestReading with censoring flags", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = SensorDetailSchema.parse(await res.json());
    expect(body.latestReading?.topBinCensored).toBe(true);
    expect(body.latestReading?.laeq).toBe(86.99);
  });

  it("orders the latest reading by receivedAt", async () => {
    await call();
    expect(mocked.sensor.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          readings: expect.objectContaining({
            orderBy: { receivedAt: "desc" },
          }),
        },
      })
    );
  });

  it("hides bench units from the public", async () => {
    mocked.sensor.findUnique.mockResolvedValue({
      ...DB_SENSOR,
      isExperimental: true,
    } as never);
    expect((await call()).status).toBe(404);
    expect((await call({ authorization: "Bearer secret" })).status).toBe(200);
  });

  it("404s an unknown sensor", async () => {
    mocked.sensor.findUnique.mockResolvedValue(null as never);
    expect((await call()).status).toBe(404);
  });
});

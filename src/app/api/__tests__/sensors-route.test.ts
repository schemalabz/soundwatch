import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), findMany: vi.fn() },
    reading: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { readingRow } from "@/lib/api/fixtures";
import { SensorListItemSchema } from "@/lib/api/schemas";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { GET } from "../sensors/route";

const mocked = vi.mocked(prisma, true);

const DB_SENSOR = {
  id: "s1",
  deviceId: "5hvdyx9a8gkxd4aa",
  name: "Skroutz Store 1",
  latitude: 37.98,
  longitude: 23.73,
  address: "Athens",
  isActive: true,
  isExperimental: false,
  lastSeenAt: new Date("2026-08-12T10:00:10Z"),
  readings: [readingRow()],
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_TOKEN;
  mocked.sensor.findMany.mockResolvedValue([DB_SENSOR] as never);
});

describe("GET /api/sensors", () => {
  it("uses the public where-clause (bench units excluded)", async () => {
    await GET(new Request("http://test/api/sensors"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_SENSOR_WHERE })
    );
  });

  it("keeps bench units excluded when includeExperimental is passed without auth", async () => {
    await GET(new Request("http://test/api/sensors?includeExperimental=1"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_SENSOR_WHERE })
    );
  });

  it("orders the embedded latest reading by receivedAt", async () => {
    await GET(new Request("http://test/api/sensors"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          readings: expect.objectContaining({
            orderBy: { receivedAt: "desc" },
          }),
        },
      })
    );
  });

  it("returns the widened latestReading", async () => {
    const res = await GET(new Request("http://test/api/sensors"));
    const body = (await res.json()) as unknown[];
    const item = SensorListItemSchema.parse(body[0]);
    expect(item.latestReading?.laeq).toBe(86.99);
    expect(item.latestReading?.topBinCensored).toBe(true);
    expect(item.latestReading?.noiseDba).toBe(86.99);
  });
});

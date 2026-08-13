import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), findMany: vi.fn() },
    reading: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { readingRow } from "@/lib/api/fixtures";
import { SensorListItemSchema } from "@/lib/api/schemas";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { GET } from "../sensors/route";

const mocked = vi.mocked(prisma, true);

// This route does NOT use Prisma's `include: { readings: { take: 1 } }` — that
// compiles to a window function over the whole readings table. It runs a
// LATERAL probe instead, so the latest reading is asserted through the raw
// query rather than through findMany's arguments.
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
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_TOKEN;
  mocked.sensor.findMany.mockResolvedValue([DB_SENSOR] as never);
  mocked.$queryRawUnsafe.mockResolvedValue([{ sensorId: "s1", ...readingRow() }] as never);
});

const lateralSql = () => String(mocked.$queryRawUnsafe.mock.calls[0][0]);

describe("GET /api/sensors", () => {
  it("uses the public where-clause (bench units excluded)", async () => {
    await GET(new Request("http://test/api/sensors"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_SENSOR_WHERE })
    );
    expect(lateralSql()).toContain("NOT s.is_experimental");
  });

  it("keeps bench units excluded when includeExperimental is passed without auth", async () => {
    await GET(new Request("http://test/api/sensors?includeExperimental=1"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_SENSOR_WHERE })
    );
    expect(lateralSql()).toContain("NOT s.is_experimental");
  });

  it("includes bench units for an authorized admin", async () => {
    process.env.ADMIN_TOKEN = "secret";
    await GET(
      new Request("http://test/api/sensors?includeExperimental=1", {
        headers: { authorization: "Bearer secret" },
      })
    );
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ isExperimental: false }) })
    );
    expect(lateralSql()).not.toContain("NOT s.is_experimental");
  });

  it("orders the latest reading by received_at, never the device clock", async () => {
    await GET(new Request("http://test/api/sensors"));
    expect(lateralSql()).toContain("ORDER BY r.received_at DESC");
    expect(lateralSql()).not.toContain("ORDER BY r.recorded_at");
  });

  it("returns the widened latestReading", async () => {
    const res = await GET(new Request("http://test/api/sensors"));
    const body = (await res.json()) as unknown[];
    const item = SensorListItemSchema.parse(body[0]);
    expect(item.latestReading?.laeq).toBe(86.99);
    expect(item.latestReading?.topBinCensored).toBe(true);
    expect(item.latestReading?.noiseDba).toBe(86.99);
  });

  it("serves a sensor that has never reported", async () => {
    mocked.$queryRawUnsafe.mockResolvedValue([] as never);
    const res = await GET(new Request("http://test/api/sensors"));
    const item = SensorListItemSchema.parse(((await res.json()) as unknown[])[0]);
    expect(item.latestReading).toBeNull();
  });
});

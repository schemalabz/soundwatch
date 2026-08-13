import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), findMany: vi.fn() },
    reading: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { GET } from "../demo/live/route";

const mocked = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  mocked.sensor.findMany.mockResolvedValue([
    { id: "s1", deviceId: "5hvdyx9a8gkxd4aa", lastSeenAt: null },
  ] as never);
  mocked.reading.findMany.mockResolvedValue([] as never);
});

describe("GET /api/demo/live", () => {
  it("excludes bench units for the public", async () => {
    await GET(new Request("http://test/api/demo/live"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isExperimental: false } })
    );
  });

  it("keeps excluding them when includeExperimental is passed without auth", async () => {
    await GET(new Request("http://test/api/demo/live?includeExperimental=1"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isExperimental: false } })
    );
  });

  it("includes them for an admin who asks", async () => {
    await GET(
      new Request("http://test/api/demo/live?includeExperimental=1", {
        headers: { authorization: "Bearer secret" },
      })
    );
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("scopes the readings query to the visible sensors", async () => {
    await GET(new Request("http://test/api/demo/live"));
    expect(mocked.reading.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sensorId: { in: ["s1"] } }),
      })
    );
  });
});

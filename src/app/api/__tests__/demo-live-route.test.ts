import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), findMany: vi.fn() },
    reading: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { GET } from "../demo/live/route";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";

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
  // These assertions used to accept `{ isExperimental: false }` — the bench
  // flag alone. That is strictly weaker than the public predicate, so the feed
  // served deactivated units and units that were never sited, while looking
  // filtered to anyone reading the test. The whole predicate, or none of it.
  it("applies the full public predicate, not just the bench flag", async () => {
    await GET(new Request("http://test/api/demo/live"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_SENSOR_WHERE })
    );
  });

  it("keeps excluding bench units when includeExperimental is passed without auth", async () => {
    await GET(new Request("http://test/api/demo/live?includeExperimental=1"));
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_SENSOR_WHERE })
    );
  });

  it("admits bench units for an admin, still requiring active and sited", async () => {
    await GET(
      new Request("http://test/api/demo/live?includeExperimental=1", {
        headers: { authorization: "Bearer secret" },
      })
    );
    // Dropping isExperimental is the point of the flag. Dropping isActive and
    // latitude with it was not — an admin asking for bench units should not
    // silently also get deactivated and unsited ones.
    expect(mocked.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: PUBLIC_SENSOR_WHERE.isActive,
          latitude: PUBLIC_SENSOR_WHERE.latitude,
        },
      })
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

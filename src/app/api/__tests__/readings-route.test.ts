import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), findMany: vi.fn() },
    reading: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { readingRow } from "@/lib/api/fixtures";
import { ReadingsResponseSchema } from "@/lib/api/schemas";
import { GET } from "../sensors/[id]/readings/route";

const mocked = vi.mocked(prisma, true);

const SENSOR = { id: "s1", deviceId: "5hvdyx9a8gkxd4aa", isExperimental: false };
const BENCH = { id: "b1", deviceId: "bench3", isExperimental: true };

function call(query = "", headers: Record<string, string> = {}) {
  return GET(new Request(`http://test/api/sensors/s1/readings${query}`, { headers }), {
    params: Promise.resolve({ id: "s1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  mocked.sensor.findUnique.mockResolvedValue(SENSOR as never);
  mocked.reading.findMany.mockResolvedValue([readingRow()] as never);
});

describe("GET /api/sensors/[id]/readings", () => {
  it("returns the widened shape with censoring flags", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = ReadingsResponseSchema.parse(await res.json());
    expect(body.readings[0].laeq).toBe(86.99);
    expect(body.readings[0].topBinCensored).toBe(true);
    expect(body.readings[0].payloadVersion).toBe(4);
    expect(body.readings[0].noiseDba).toBe(86.99); // deprecated alias
  });

  it("orders by receivedAt, never recordedAt", async () => {
    await call();
    expect(mocked.reading.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { receivedAt: "desc" } })
    );
  });

  it("still filters the window on recordedAt (chart-axis semantics)", async () => {
    await call("?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z");
    const args = mocked.reading.findMany.mock.calls[0][0]!;
    expect(args.where).toMatchObject({
      sensorId: "s1",
      recordedAt: {
        gte: new Date("2026-08-01T00:00:00Z"),
        lte: new Date("2026-08-02T00:00:00Z"),
      },
    });
  });

  it("rejects a malformed query with 400", async () => {
    expect((await call("?limit=abc")).status).toBe(400);
    expect((await call("?limit=99999")).status).toBe(400);
    expect((await call("?from=not-a-date")).status).toBe(400);
  });

  it("hides bench units from the public (404, not 403)", async () => {
    mocked.sensor.findUnique.mockResolvedValue(BENCH as never);
    expect((await call()).status).toBe(404);
  });

  it("serves bench units to an admin", async () => {
    mocked.sensor.findUnique.mockResolvedValue(BENCH as never);
    const res = await call("", { authorization: "Bearer secret" });
    expect(res.status).toBe(200);
  });

  it("404s an unknown sensor", async () => {
    mocked.sensor.findUnique.mockResolvedValue(null as never);
    expect((await call()).status).toBe(404);
  });
});

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
  shareKey: null as string | null,
  lastSeenAt: new Date("2026-08-12T10:00:10Z"),
  createdAt: new Date("2026-07-01T00:00:00Z"),
  readings: [readingRow()],
};

function call(headers: Record<string, string> = {}, query = "") {
  return GET(new Request(`http://test/api/sensors/s1${query}`, { headers }), {
    params: Promise.resolve({ id: "s1" }),
  });
}

/**
 * The route queries twice: the gate's two columns first, the row with its
 * readings only once the gate has let the caller through. The mock answers
 * each the way Prisma would — a projection for the `select`, the whole row
 * for the `include` — so a test cannot pass by reading fields the first
 * query never asked for.
 */
function mockSensor(row: typeof DB_SENSOR | null) {
  mocked.sensor.findUnique.mockImplementation((async (args: {
    select?: unknown;
  }) => {
    if (!row) return null;
    if (args.select) {
      return { isExperimental: row.isExperimental, shareKey: row.shareKey };
    }
    return row;
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  mockSensor(DB_SENSOR);
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
    expect(mocked.sensor.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        include: {
          readings: expect.objectContaining({
            orderBy: { receivedAt: "desc" },
          }),
        },
      })
    );
  });

  it("decides who may look before it loads anything worth timing", async () => {
    // The 404 for a hidden sensor must not cost more than the 404 for an id
    // that does not exist, or the difference confirms the bench unit without
    // a credential. The only way to keep the two alike is to gate on a
    // two-column lookup and load the row — and its latest reading — after.
    await call();
    const first = mocked.sensor.findUnique.mock.calls[0][0]!;
    expect(first).toEqual({
      where: { id: "s1" },
      select: { isExperimental: true, shareKey: true },
    });
    expect(first).not.toHaveProperty("include");
  });

  it("never loads the row for a sensor the caller may not see", async () => {
    mockSensor({ ...DB_SENSOR, isExperimental: true });
    expect((await call()).status).toBe(404);
    // The gate lookup, and nothing after it.
    expect(mocked.sensor.findUnique).toHaveBeenCalledTimes(1);
  });

  it("hides bench units from the public", async () => {
    mockSensor({ ...DB_SENSOR, isExperimental: true });
    expect((await call()).status).toBe(404);
    expect((await call({ authorization: "Bearer secret" })).status).toBe(200);
  });

  it("404s an unknown sensor", async () => {
    mockSensor(null);
    expect((await call()).status).toBe(404);
  });

  it("never lets a shared cache store or reuse a credential-gated response", async () => {
    // The 200 and the 404 come from the same URL and differ only by
    // credential: a CDN or corporate proxy that stored either would answer
    // the wrong caller with it.
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("vary")).toBe("authorization");

    mockSensor(null);
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(missing.headers.get("vary")).toBe("authorization");
  });

  it("reports whether the sensor is a bench unit", async () => {
    const body = SensorDetailSchema.parse(await (await call()).json());
    expect(body.isExperimental).toBe(false);
  });

  it("serves a bench unit to its share-key holder, and never echoes the key", async () => {
    mockSensor({ ...DB_SENSOR, isExperimental: true, shareKey: "x7Qd9pLm2vRt4wYz8nBk3c" });
    expect((await call({}, "?k=wrong")).status).toBe(404);
    const res = await call({}, "?k=x7Qd9pLm2vRt4wYz8nBk3c");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("x7Qd9pLm2vRt4wYz8nBk3c");
    expect(text).not.toMatch(/"shareKey"/);
    expect(JSON.parse(text).isExperimental).toBe(true);
  });
});

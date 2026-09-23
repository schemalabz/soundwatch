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

const SENSOR = { id: "s1", deviceId: "5hvdyx9a8gkxd4aa", isExperimental: false, shareKey: null };
const BENCH = { id: "b1", deviceId: "bench3", isExperimental: true, shareKey: "x7Qd9pLm2vRt4wYz8nBk3c" };

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

  it("filters receivedFrom on the server clock (receivedAt)", async () => {
    await call("?receivedFrom=2026-08-01T00:00:00Z");
    const args = mocked.reading.findMany.mock.calls[0][0]!;
    expect(args.where).toMatchObject({
      sensorId: "s1",
      receivedAt: { gte: new Date("2026-08-01T00:00:00Z") },
    });
    expect(args.where).not.toHaveProperty("recordedAt");
  });

  it("ANDs receivedFrom with the device-clock window", async () => {
    await call("?from=2026-08-01T00:00:00Z&receivedFrom=2026-08-02T00:00:00Z");
    const args = mocked.reading.findMany.mock.calls[0][0]!;
    expect(args.where).toMatchObject({
      sensorId: "s1",
      recordedAt: { gte: new Date("2026-08-01T00:00:00Z") },
      receivedAt: { gte: new Date("2026-08-02T00:00:00Z") },
    });
  });

  it("rejects a malformed query with 400", async () => {
    expect((await call("?limit=abc")).status).toBe(400);
    expect((await call("?limit=99999")).status).toBe(400);
    expect((await call("?from=not-a-date")).status).toBe(400);
    expect((await call("?receivedFrom=not-a-date")).status).toBe(400);
  });

  // Date.parse happily accepts the ends of the ECMAScript range. They used to
  // pass the refine, reach Prisma as a Date and throw inside the driver — and
  // the throw came back as Next's own 500: an empty body with NEITHER
  // cache-control nor vary, on a route whose comment promises both on every
  // response. The refine now stops them, so they get the ordinary 400.
  const OUT_OF_RANGE = ["+275760-09-13T00:00:00Z", "-271821-04-20T00:00:00Z"];

  it("answers 400, not a framework 500, for an out-of-range date", async () => {
    for (const value of OUT_OF_RANGE) {
      for (const param of ["from", "to", "receivedFrom"]) {
        const res = await call(`?${param}=${encodeURIComponent(value)}`);
        expect([param, value, res.status]).toEqual([param, value, 400]);
        const body = await res.json();
        expect(body.error).toBe("Invalid query");
        expect(body.issues).toEqual([
          `${param}: must be an ISO 8601 date-time between 1970-01-01 and 2200-01-01`,
        ]);
      }
    }
    expect(mocked.reading.findMany).not.toHaveBeenCalled();
  });

  it("carries the no-shared-cache headers on that 400 too", async () => {
    for (const value of OUT_OF_RANGE) {
      const res = await call(`?receivedFrom=${encodeURIComponent(value)}`);
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("vary")).toBe("authorization");
    }
  });

  it("still accepts a date inside the range", async () => {
    const res = await call("?from=2026-08-01T00:00:00Z&receivedFrom=2026-08-02T00:00:00Z");
    expect(res.status).toBe(200);
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

  it("serves bench units to the right share key only", async () => {
    mocked.sensor.findUnique.mockResolvedValue(BENCH as never);
    expect((await call("?k=nope")).status).toBe(404);
    const res = await call("?k=x7Qd9pLm2vRt4wYz8nBk3c");
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("x7Qd9pLm2vRt4wYz8nBk3c");
  });

  it("404s an unknown sensor", async () => {
    mocked.sensor.findUnique.mockResolvedValue(null as never);
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

    mocked.sensor.findUnique.mockResolvedValue(BENCH as never);
    const hidden = await call();
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("cache-control")).toBe("no-store");
    expect(hidden.headers.get("vary")).toBe("authorization");
  });

  it("serves CSV as an attachment when asked", async () => {
    mocked.sensor.findUnique.mockResolvedValue({ ...SENSOR, name: "Sim Kypseli" } as never);
    const res = await call("?format=csv&from=2026-08-12T09:00:00Z");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="soundwatch-sim-kypseli-20260812T0900-now.csv"; filename*=UTF-8\'\'soundwatch-sim-kypseli-20260812T0900-now.csv'
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text.split("\n")[0].startsWith("recorded_at,received_at,laeq,")).toBe(true);
    expect(text).toContain("2026-08-12T10:00:00.000Z,2026-08-12T10:00:05.000Z,86.99,");
  });

  it("survives a Greek sensor name in the CSV filename header", async () => {
    mocked.sensor.findUnique.mockResolvedValue({ ...SENSOR, name: "Βαλτινών Γκύζη" } as never);
    const res = await call("?format=csv&from=2026-08-12T09:00:00Z");
    expect(res.status).toBe(200);
    const disposition = res.headers.get("content-disposition") ?? "";
    // The mocked sensor id is "s1": with no ASCII letter or digit left in the
    // Greek name once stripped to ASCII, the id fallback carries the ASCII
    // filename= instead of a run of bare dashes.
    expect(disposition.startsWith('attachment; filename="soundwatch-s1-20260812T0900-now.csv"')).toBe(true);
    const beforeStar = disposition.split("filename*=")[0];
    expect(/^[\x00-\x7F]*$/.test(beforeStar)).toBe(true);
    expect(disposition).toContain("filename*=UTF-8''soundwatch-%CE%B2");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUBLIC_SENSOR_WHERE } from "@/lib/locations";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// What an unauthenticated route may do, enforced by INVOKING it.
//
// The previous version of this file read route source text and asked whether
// certain identifiers appeared in it. That is not a check, it is a spelling
// test, and it failed the one case it existed for: deleting
// `WHERE ${PUBLIC_SENSOR_RAW}` from /api/freshness — the original leak,
// reintroduced verbatim — passed all four tests. Three independent reasons,
// all of them fatal:
//
//   - The detector matched /FROM sensors/, and /api/aggregate and /api/series
//     say `JOIN sensors s`. Neither was ever in scope.
//   - "Filtered" meant "the identifier occurs somewhere in the file", which an
//     orphaned import satisfies. eslint reports that as a warning, so CI stays
//     green.
//   - It only walked files named exactly `route.ts`, and its skip-list matched
//     a bare directory name at any depth.
//
// So: mock the database, call each route's GET, and look at the SQL that
// actually reached Prisma. A route cannot spell its way past that.

const queries: string[] = [];

function record(sql: unknown, ...values: unknown[]): [] {
  // $queryRawUnsafe gets a finished string. $queryRaw is a tagged template:
  // (strings, ...values), and a Prisma.raw() value carries real SQL rather
  // than a bind parameter — PUBLIC_SENSOR_RAW arrives that way, so rendering
  // every interpolation as "?" would hide the very predicate under test.
  if (typeof sql === "string") {
    queries.push(sql);
  } else if (Array.isArray(sql)) {
    const rendered = sql.reduce((acc: string, part: string, i: number) => {
      if (i === 0) return part;
      const v = values[i - 1] as { strings?: string[]; sql?: string } | undefined;
      const inlined =
        typeof v?.sql === "string"
          ? v.sql
          : Array.isArray(v?.strings)
            ? v.strings.join(" ? ")
            : "?";
      return acc + inlined + part;
    }, "");
    queries.push(rendered);
  }
  return [];
}

// Realistic rows. With [] the routes serialize nothing and every assertion
// about a RESPONSE passes without exercising anything — the same vacuous-pass
// trap this file exists to avoid.
const SENSOR_ROW = {
  id: "s1",
  deviceId: "tok123",
  name: "Sim Kypseli",
  latitude: 37.99,
  longitude: 23.73,
  address: "Πατησίων 1",
  isActive: true,
  isExperimental: false,
  lastSeenAt: new Date(),
  hardwareId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const findMany = vi.fn(() => [SENSOR_ROW] as unknown[]);
const findUnique = vi.fn(() => null as unknown);

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(record),
    $queryRawUnsafe: vi.fn(record),
    sensor: {
      findMany: (...a: unknown[]) => findMany(...(a as [])),
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      count: vi.fn(() => 0),
    },
    reading: { findMany: vi.fn(() => []), aggregate: vi.fn(() => ({ _max: {} })) },
  },
}));

const NOW = Date.now();

/**
 * Every route module under src/app/api that is not behind a credential.
 *
 * Discovered by walking, not listed — a listed set cannot notice a new route,
 * which is exactly how /api/freshness came to be the one endpoint without the
 * filter. Next resolves route.{js,jsx,ts,tsx}, so all four are matched.
 */
const AUTHENTICATED = new Set(["admin", "install", "firmware"]);

function routeFiles(dir: string, rel = "", out: { rel: string; abs: string }[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const next = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      // Match the FIRST path segment only. A bare-name match at any depth would
      // skip api/sensors/admin/route.ts, which is not an authenticated route.
      if (!rel && AUTHENTICATED.has(e.name)) continue;
      if (e.name === "__tests__") continue;
      routeFiles(join(dir, e.name), next, out);
    } else if (/^route\.(t|j)sx?$/.test(e.name)) {
      out.push({ rel: next, abs: join(dir, e.name) });
    }
  }
  return out;
}

const ROUTES = routeFiles(join(process.cwd(), "src/app/api"));

/** Dynamic-segment context. Routes that take no params ignore the argument. */
type Ctx = { params: Promise<{ id: string; token: string }> };
const ctx = (): Ctx => ({ params: Promise.resolve({ id: "s1", token: "tok123" }) });

/** Query-string arguments that make each route do its work. */
const ARGS: Record<string, string> = {
  "aggregate/route.ts": `?from=${NOW - 86_400_000}`,
  "series/route.ts": `?from=${NOW - 86_400_000}`,
  "frames/route.ts": `?at=${NOW}`,
};

beforeEach(() => {
  queries.length = 0;
  vi.clearAllMocks();
  findMany.mockReturnValue([SENSOR_ROW]);
  findUnique.mockReturnValue(null);
  delete process.env.ADMIN_TOKEN;
});

describe("unauthenticated API surface", () => {
  it("discovers every public route", () => {
    expect(ROUTES.map((r) => r.rel).sort()).toContain("freshness/route.ts");
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });

  describe.each(ROUTES.map((r) => [r.rel, r.abs] as const))("%s", (rel, abs) => {
    it("filters sensors to the public set, or never reads them", async () => {
      const mod = (await import(abs)) as { GET?: (req: NextRequest, ctx: Ctx) => Promise<Response> };
      if (typeof mod.GET !== "function") return; // POST-only route

      // NextRequest, not Request: these routes read req.nextUrl.searchParams,
      // and a plain Request has no nextUrl. The first version of this file
      // passed a Request, so /api/aggregate, /api/series and /api/frames threw
      // on line one, the catch swallowed it, and all three "passed" having run
      // no query at all. A guard that cannot reach a route must say so.
      let threw: unknown = null;
      try {
        await mod.GET(new NextRequest(`http://test/api/x${ARGS[rel] ?? ""}`), ctx());
      } catch (err) {
        threw = err;
      }
      expect(threw, `${rel} threw before reaching the database: ${threw}`).toBeNull();

      const touching = queries.filter((q) => /\bsensors\b/i.test(q));
      for (const q of touching) {
        // Whitespace-insensitive: the clause is written across lines.
        const flat = q.replace(/\s+/g, " ");
        expect(
          /is_active AND NOT s\.is_experimental AND s\.latitude IS NOT NULL/.test(flat),
          `${rel} runs a query naming sensors without the public predicate:\n${flat.slice(0, 400)}`
        ).toBe(true);
      }

      // Prisma-side reads must carry the SAME restriction, all three parts of
      // it. An `||` here would accept any one of them, which is how
      // /api/demo/live shipped filtering on the bench flag alone — serving
      // deactivated and never-sited units on a public feed, while looking
      // filtered.
      for (const call of findMany.mock.calls as unknown as [{ where?: Record<string, unknown> }][]) {
        const where = call[0]?.where ?? {};
        expect(
          where,
          `${rel} calls sensor.findMany without the full public where-clause`
        ).toMatchObject({
          isActive: PUBLIC_SENSOR_WHERE.isActive,
          isExperimental: PUBLIC_SENSOR_WHERE.isExperimental,
          latitude: PUBLIC_SENSOR_WHERE.latitude,
        });
      }
    });
  });

  it("never publishes deviceId", async () => {
    // deviceId IS the install credential: POST /api/install/{token}/location
    // resolves its sensor with findUnique({ where: { deviceId: token } }) and
    // authenticates with nothing else.
    for (const { rel, abs } of ROUTES) {
      const mod = (await import(abs)) as { GET?: (req: NextRequest, ctx: Ctx) => Promise<Response> };
      if (typeof mod.GET !== "function") continue;
      const res = await mod.GET(new NextRequest(`http://test/api/x${ARGS[rel] ?? ""}`), ctx());
      const body = await res.text();
      expect(body, `${rel} returned a deviceId`).not.toMatch(/"deviceId"/);
    }
  });

  it("404s an id-addressed bench unit", async () => {
    // These routes fetch by id and then decide, so there is no where-clause to
    // inspect — the assertion has to be on the answer.
    const byId = ROUTES.filter((r) => r.rel.includes("[id]"));
    expect(byId.length).toBeGreaterThan(0);

    for (const { rel, abs } of byId) {
      findUnique.mockReturnValue({
        id: "s1",
        deviceId: "secret",
        name: "bench",
        isExperimental: true,
        isActive: true,
        latitude: 37.9,
        longitude: 23.7,
        readings: [],
      });
      const mod = (await import(abs)) as {
        GET?: (req: NextRequest, c: Ctx) => Promise<Response>;
      };
      if (typeof mod.GET !== "function") continue;
      const res = await mod.GET(new NextRequest("http://test/api/x"), ctx());
      expect(res.status, `${rel} served a bench unit`).toBe(404);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_SENSOR_SQL } from "@/lib/server/filterSql";

// Two rules about what an unauthenticated route may do, enforced over source
// text rather than over responses — because the failure they guard against is
// a route that FORGETS, and you cannot write a response assertion for a route
// nobody remembered to write assertions for.
//
// /api/freshness shipped with the sensor filter simply absent: no is_active,
// no is_experimental, no latitude. It served the whole fleet — bench units,
// units that were never installed — to any visitor, polled every 5 s from the
// home page. Seven other routes had the clause; the eighth did not; nothing
// noticed. That is what a copy-pasted predicate buys you.

const API_ROOT = join(process.cwd(), "src/app/api");

// Routes behind a credential. admin checks a bearer token; install is
// deliberately open but is the thing being protected, not a leak of it;
// firmware reads a device's own id from a request header.
const AUTHENTICATED = ["admin", "install", "firmware"];

function publicRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (AUTHENTICATED.includes(entry.name)) continue;
      if (entry.name === "__tests__") continue;
      publicRoutes(join(dir, entry.name), out);
    } else if (entry.name === "route.ts") {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Comments explain why deviceId is dangerous; they must not trip the check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const ROUTES = publicRoutes(API_ROOT).map((path) => {
  const raw = readFileSync(path, "utf8");
  return {
    path,
    rel: path.slice(process.cwd().length + 1),
    raw,
    src: stripComments(raw),
  };
});

describe("unauthenticated API surface", () => {
  it("finds the routes to check", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });

  it("never publishes deviceId", () => {
    // deviceId IS the install credential: POST /api/install/{token}/location
    // resolves its sensor with findUnique({ where: { deviceId: token } }) and
    // authenticates with nothing else. The stated security model is "you are
    // holding the box". Returning deviceId from a public route hands that key
    // to anyone who can GET, and with force:true they can relocate a sensor
    // that is already installed.
    const leaking = ROUTES.filter((r) => /\bdeviceId\b|\bdevice_id\b/.test(r.src));
    expect(leaking.map((r) => r.rel)).toEqual([]);
  });

  it("filters sensors to the public set wherever it reads them", () => {
    const readsSensors = ROUTES.filter(
      (r) => /FROM sensors|prisma\.sensor\./.test(r.src)
    );
    expect(readsSensors.length).toBeGreaterThanOrEqual(6);

    // Either the shared SQL fragment, the shared Prisma where-clause, or —
    // for a $queryRaw template, which cannot interpolate an identifier — the
    // clause written out verbatim. The verbatim case is pinned to the constant
    // below so the two cannot drift.
    const unfiltered = readsSensors.filter(
      (r) =>
        !r.src.includes("PUBLIC_SENSOR_SQL") &&
        !r.src.includes("PUBLIC_SENSOR_RAW") &&
        !r.src.includes("PUBLIC_SENSOR_WHERE") &&
        !r.src.includes(PUBLIC_SENSOR_SQL) &&
        !r.src.includes("isExperimental: false") &&
        // Single-sensor routes gate differently: fetch by id, then 404 if it
        // turns out to be a bench unit and the caller is not an admin.
        !/isExperimental && checkAdminAuth/.test(r.src)
    );
    expect(unfiltered.map((r) => r.rel)).toEqual([]);
  });

  it("uses the Prisma.raw form inside $queryRaw tagged templates", () => {
    // A tagged template BINDS its interpolations. `WHERE ${PUBLIC_SENSOR_SQL}`
    // compiles to `WHERE $1` with the clause passed as a string parameter, and
    // Postgres answers "argument of WHERE must be type boolean, not text" — a
    // 500. This was introduced by the refactor that created the constant, and
    // /api/status served 500 until it was caught. $queryRawUnsafe takes a
    // JS-built string and wants the plain form; the two are not interchangeable.
    const wrong = ROUTES.filter(
      (r) => /\$queryRaw</.test(r.src) && /\$\{PUBLIC_SENSOR_SQL\}/.test(r.src)
    );
    expect(wrong.map((r) => r.rel)).toEqual([]);

    for (const r of ROUTES.filter((x) => /\$queryRaw</.test(x.src) && /FROM sensors/.test(x.src))) {
      expect(r.src, r.rel).toContain("PUBLIC_SENSOR_RAW");
    }
  });
});

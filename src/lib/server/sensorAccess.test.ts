import { beforeEach, describe, expect, it } from "vitest";
import {
  canViewSensor,
  generateShareKey,
  shareKeyMatches,
} from "./sensorAccess";

const PUBLIC = { isExperimental: false, shareKey: null };
const BENCH = { isExperimental: true, shareKey: "x7Qd9pLm2vRt4wYz8nBk3c" };
const BENCH_NO_KEY = { isExperimental: true, shareKey: null };

const req = (query = "", headers: Record<string, string> = {}) =>
  new Request(`http://test/api/sensors/s1${query}`, { headers });

beforeEach(() => {
  process.env.ADMIN_TOKEN = "secret";
});

describe("generateShareKey", () => {
  it("is 22 URL-safe characters and not repeated", () => {
    const a = generateShareKey();
    const b = generateShareKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });
});

describe("shareKeyMatches", () => {
  it("matches only the exact key", () => {
    expect(shareKeyMatches(BENCH.shareKey, BENCH.shareKey)).toBe(true);
    expect(shareKeyMatches("x7Qd9pLm2vRt4wYz8nBk3C", BENCH.shareKey)).toBe(false);
    expect(shareKeyMatches("x7Qd9pLm2vRt4wYz8nBk3", BENCH.shareKey)).toBe(false);
  });

  it("never matches when either side is missing", () => {
    expect(shareKeyMatches(null, BENCH.shareKey)).toBe(false);
    expect(shareKeyMatches("", BENCH.shareKey)).toBe(false);
    expect(shareKeyMatches("anything", null)).toBe(false);
    // A sensor with no key must not be opened by an empty k.
    expect(shareKeyMatches("", null)).toBe(false);
  });
});

describe("canViewSensor", () => {
  it("lets anyone see a public sensor", () => {
    expect(canViewSensor(req(), PUBLIC)).toBe(true);
  });

  it("hides a bench unit from anonymous requests", () => {
    expect(canViewSensor(req(), BENCH)).toBe(false);
  });

  it("lets an admin see a bench unit", () => {
    expect(canViewSensor(req("", { authorization: "Bearer secret" }), BENCH)).toBe(true);
    expect(canViewSensor(req("", { authorization: "Bearer wrong" }), BENCH)).toBe(false);
  });

  it("lets the right share key see a bench unit, and nothing else", () => {
    expect(canViewSensor(req(`?k=${BENCH.shareKey}`), BENCH)).toBe(true);
    expect(canViewSensor(req("?k=nope"), BENCH)).toBe(false);
    expect(canViewSensor(req(`?k=${BENCH.shareKey}`), BENCH_NO_KEY)).toBe(false);
    expect(canViewSensor(req("?k="), BENCH_NO_KEY)).toBe(false);
  });

  it("reads the same ?k= the query parser reads when it is repeated", () => {
    // The parser sees Object.fromEntries(searchParams) — last value wins.
    // The gate used .get() — first value wins — so `?k=valid&k=junk` was a
    // 200 while `?k=junk&k=valid` was a 404, and a proxy that reorders
    // parameters could have the two disagree. Both orderings now answer the
    // same way, and that way is the parser's.
    expect(canViewSensor(req(`?k=${BENCH.shareKey}&k=junk`), BENCH)).toBe(false);
    expect(canViewSensor(req(`?k=junk&k=${BENCH.shareKey}`), BENCH)).toBe(true);
  });

  it("ignores the key when the admin token is unset on the server", () => {
    delete process.env.ADMIN_TOKEN;
    expect(canViewSensor(req("", { authorization: "Bearer secret" }), BENCH)).toBe(false);
    expect(canViewSensor(req(`?k=${BENCH.shareKey}`), BENCH)).toBe(true);
  });
});

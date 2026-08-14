import { describe, expect, it } from "vitest";
import { MAX_EPOCH_MS, parseEpochMs, parseWireFilters } from "./filters";
import { filterSql, locationSql, rangesSql } from "@/lib/server/filterSql";

// Every one of these produced a 500 on an unauthenticated route. None is an
// injection — the SQL is built only from validated enums and numbers — but a
// query string that reliably crashes a public endpoint is still a query string
// that reliably crashes a public endpoint.
//
// The common shape is a guard that tests for the wrong thing: `??` and `in`
// both see the prototype chain, and `Number.isFinite` is not a bound.

describe("hostile wire params", () => {
  describe("prototype-chain keys", () => {
    // `"toString" in HOUR_PRESET_RANGES` is true. The old filter used `in`,
    // so hours=toString survived decoding, and filterSql then called .map()
    // on Function.prototype.toString.
    for (const key of ["toString", "constructor", "valueOf", "__proto__", "hasOwnProperty"]) {
      it(`drops hours=${key} instead of crashing filterSql`, () => {
        const f = parseWireFilters(new URLSearchParams(`hours=${key}`));
        expect(f.hours.size).toBe(0);
        expect(() => filterSql(f)).not.toThrow();
      });
    }

    it("still accepts the real presets", () => {
      const f = parseWireFilters(new URLSearchParams("hours=night,peak"));
      expect([...f.hours].sort()).toEqual(["night", "peak"]);
      expect(filterSql(f)).toContain("EXTRACT(hour");
    });
  });

  describe("epoch bounds", () => {
    // 1e20 is finite. new Date(1e20).toISOString() throws RangeError.
    for (const raw of ["1e20", "1e300", "-1", "0", "NaN", "", "abc", null]) {
      it(`rejects from=${JSON.stringify(raw)}`, () => {
        expect(parseEpochMs(raw)).toBeNull();
      });
    }

    it("accepts a real instant", () => {
      expect(parseEpochMs("1755000000000")).toBe(1755000000000);
    });

    it("bounds the range list, so rangesSql never formats an absurd date", () => {
      const f = parseWireFilters(new URLSearchParams("ranges=1e20:1e21,1755000000000:1755100000000"));
      expect(f.ranges).toHaveLength(1);
      expect(() => rangesSql(f, "r.recorded_at")).not.toThrow();
    });

    it("MAX_EPOCH_MS is a date toISOString can actually format", () => {
      expect(() => new Date(MAX_EPOCH_MS).toISOString()).not.toThrow();
      expect(new Date(MAX_EPOCH_MS).getUTCFullYear()).toBe(2100);
    });
  });

  describe("location bounds", () => {
    // locationSql inlines Math.round(radiusM ** 2) into SQL. Above ~1e155 that
    // overflows to Infinity, renders as a bare `Infinity` token, and Postgres
    // answers `column "infinity" does not exist` — a 500 from a query string.
    // Verified against a live server: 500 before, 200 after.
    for (const bad of [
      "23.7:37.9:1e155", // radius overflows the square
      "23.7:37.9:1e300",
      "23.7:1e300:500", // latitude off the planet
      "1e300:37.9:500", // longitude off the planet
      "23.7:37.9:0", // zero radius
      "23.7:37.9:-500", // negative radius
      "23.7:37.9:250000", // beyond MAX_RADIUS_M
      "23.7:37.9", // not a triple
      "abc:def:ghi",
    ]) {
      it(`drops loc=${bad}`, () => {
        const f = parseWireFilters(new URLSearchParams(`loc=${bad}`));
        expect(f.locations).toHaveLength(0);
        expect(locationSql(f)).toBe("");
      });
    }

    it("keeps a real pin, and renders finite SQL for it", () => {
      const f = parseWireFilters(new URLSearchParams("loc=23.7275:37.9838:500"));
      expect(f.locations).toHaveLength(1);
      const sql = locationSql(f);
      expect(sql).toContain("power(");
      expect(sql).not.toMatch(/Infinity|NaN/);
    });

    it("keeps the good pin and drops the bad one from the same list", () => {
      const f = parseWireFilters(
        new URLSearchParams("loc=23.7275:37.9838:500,23.7:37.9:1e155")
      );
      expect(f.locations).toHaveLength(1);
      expect(f.locations[0].radiusM).toBe(500);
    });
  });
});

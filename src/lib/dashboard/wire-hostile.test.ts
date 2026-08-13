import { describe, expect, it } from "vitest";
import { MAX_EPOCH_MS, parseEpochMs, parseWireFilters } from "./filters";
import { filterSql, rangesSql } from "@/lib/server/filterSql";

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
});

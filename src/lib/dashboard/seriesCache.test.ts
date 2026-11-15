import { describe, expect, it } from "vitest";
import { hourStableQuery } from "./seriesCache";

describe("hourStableQuery", () => {
  const HOUR = 3_600_000;
  it("is the same string for every minute of an hour, and changes with the hour", () => {
    const at = (ms: number) => hourStableQuery(`from=${ms}&days=weekend&hours=night`);
    const hour = 500_000 * HOUR;
    expect(at(hour + 60_000)).toBe(at(hour + 59 * 60_000));
    expect(at(hour + 60_000)).toBe(`from=${hour}&days=weekend&hours=night`);
    expect(at(hour + HOUR)).not.toBe(at(hour));
  });
  it("leaves the other filters as they were", () => {
    const q = "from=1786975200000&ranges=1:2%2C3:4&loc=23.70000:37.98000:500";
    expect(new URLSearchParams(hourStableQuery(q)).get("ranges")).toBe("1:2,3:4");
    expect(new URLSearchParams(hourStableQuery(q)).get("loc")).toBe("23.70000:37.98000:500");
  });
  it("passes a query without from= through", () => {
    expect(hourStableQuery("days=weekend")).toBe("days=weekend");
  });
});

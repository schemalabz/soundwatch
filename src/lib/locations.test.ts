import { describe, expect, it } from "vitest";
import {
  computeStage,
  decideLocationWrite,
  parseImportRows,
  PUBLIC_SENSOR_WHERE,
  slugifyKey,
} from "./locations";

describe("PUBLIC_SENSOR_WHERE", () => {
  it("public existence = active + not experimental + has a location", () => {
    // The homepage and leaderboard consume this filter. Weakening it re-leaks
    // the bench fleet and every minted-but-uninstalled token as ghost sensors.
    expect(PUBLIC_SENSOR_WHERE).toEqual({
      isActive: true,
      isExperimental: false,
      latitude: { not: null },
    });
  });
});

describe("slugifyKey", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyKey("Plateia Syntagmatos 3")).toBe("plateia-syntagmatos-3");
  });
  it("keeps greek letters", () => {
    expect(slugifyKey("Πλατεία Συντάγματος")).toBe("πλατεία-συντάγματος");
  });
  it("collapses punctuation runs and trims", () => {
    expect(slugifyKey("  A --- B!! ")).toBe("a-b");
  });
});

describe("parseImportRows", () => {
  it("accepts valid rows and defaults key from name", () => {
    const r = parseImportRows([
      { name: "Site A", latitude: 37.98, longitude: 23.72 },
      { key: "custom", name: "Site B", latitude: 38.0, longitude: 23.7, address: "Odos 1" },
    ]);
    if ("error" in r) throw new Error(r.error);
    expect(r.rows[0].key).toBe("site-a");
    expect(r.rows[1].key).toBe("custom");
    expect(r.rows[1].address).toBe("Odos 1");
  });
  it("rejects non-arrays", () => {
    expect(parseImportRows({})).toEqual({ error: "body must be an array of locations" });
  });
  it("rejects out-of-range coordinates with the row index", () => {
    const r = parseImportRows([{ name: "X", latitude: 91, longitude: 0 }]);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("row 0");
  });
  it("passes isActive through for retirement, omits it when absent", () => {
    const r = parseImportRows([
      { name: "Live", latitude: 1, longitude: 1 },
      { name: "Dead", latitude: 2, longitude: 2, isActive: false },
    ]);
    if ("error" in r) throw new Error(r.error);
    expect("isActive" in r.rows[0]).toBe(false);
    expect(r.rows[1].isActive).toBe(false);
  });
  it("rejects duplicate keys within one import", () => {
    const r = parseImportRows([
      { name: "Same", latitude: 1, longitude: 1 },
      { name: "Same", latitude: 2, longitude: 2 },
    ]);
    expect((r as { error: string }).error).toContain("duplicate key");
  });
});

describe("computeStage", () => {
  const now = new Date("2026-08-03T12:00:00Z");
  const recent = new Date("2026-08-03T11:58:00Z"); // inside 5-min window
  const stale = new Date("2026-08-03T10:00:00Z");
  it("minted: nothing but the row", () => {
    expect(computeStage({ provisionedAt: null, installedAt: null, lastSeenAt: null }, now)).toBe("minted");
  });
  it("in_box: provisioned, not installed — even with a RECENT lastSeenAt (prove-phase trap)", () => {
    expect(computeStage({ provisionedAt: stale, installedAt: null, lastSeenAt: recent }, now)).toBe("in_box");
  });
  it("installed_live: installed and seen within the window", () => {
    expect(computeStage({ provisionedAt: stale, installedAt: stale, lastSeenAt: recent }, now)).toBe("installed_live");
  });
  it("installed_silent: installed, last seen too long ago (or never)", () => {
    expect(computeStage({ provisionedAt: stale, installedAt: stale, lastSeenAt: stale }, now)).toBe("installed_silent");
    expect(computeStage({ provisionedAt: stale, installedAt: stale, lastSeenAt: null }, now)).toBe("installed_silent");
  });
});

describe("decideLocationWrite", () => {
  const base = { sensorHasLocation: false, force: false, siteOccupiedByOther: false, acceptOccupied: false };
  it("plain first install is ok", () => {
    expect(decideLocationWrite(base)).toEqual({ ok: true });
  });
  it("already located blocks without force", () => {
    expect(decideLocationWrite({ ...base, sensorHasLocation: true })).toEqual({ ok: false, status: 409, error: "already_located" });
  });
  it("force clears already_located but not site_occupied", () => {
    expect(decideLocationWrite({ ...base, sensorHasLocation: true, force: true, siteOccupiedByOther: true })).toEqual({ ok: false, status: 409, error: "site_occupied" });
  });
  it("occupied site blocks without acceptOccupied", () => {
    expect(decideLocationWrite({ ...base, siteOccupiedByOther: true })).toEqual({ ok: false, status: 409, error: "site_occupied" });
  });
  it("both conflicts need both flags", () => {
    expect(decideLocationWrite({ sensorHasLocation: true, force: true, siteOccupiedByOther: true, acceptOccupied: true })).toEqual({ ok: true });
  });
});

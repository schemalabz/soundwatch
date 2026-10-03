import { describe, expect, it } from "vitest";
import { benchCheck, groupBoxes, type TokenRow } from "./inventory";

const row = (deviceId: string, hardwareId: string | null, created: string, extra: Partial<TokenRow> = {}): TokenRow => ({
  id: deviceId, deviceId, hardwareId, createdAt: new Date(created), retiredAt: null, isActive: true, isExperimental: false, ...extra,
});

describe("groupBoxes", () => {
  it("one chip, two tokens: the newer is current, the older a duplicate (bench3 → fkwx29y7)", () => {
    const [box] = groupBoxes([
      row("bench3", "D1411D03", "2026-08-02", { isExperimental: true }),
      row("fkwx29y7", "D1411D03", "2026-10-01"),
    ]);
    expect(box.current.deviceId).toBe("fkwx29y7");
    expect(box.previous.map((r) => r.deviceId)).toEqual(["bench3"]);
    expect(box.duplicates.map((r) => r.deviceId)).toEqual(["bench3"]);
  });

  it("a retired old token is history, not a duplicate", () => {
    const [box] = groupBoxes([
      row("bench3", "D1411D03", "2026-08-02", { retiredAt: new Date("2026-10-03") }),
      row("fkwx29y7", "D1411D03", "2026-10-01"),
    ]);
    expect(box.duplicates).toEqual([]);
    expect(box.previous).toHaveLength(1);
  });

  it("an inactive legacy row is not a duplicate either", () => {
    const [box] = groupBoxes([row("old", "X", "2026-05-01", { isActive: false }), row("new", "X", "2026-10-01")]);
    expect(box.duplicates).toEqual([]);
  });

  it("rows without a chip id are their own box", () => {
    expect(groupBoxes([row("a", null, "2026-05-01"), row("b", null, "2026-05-02")])).toHaveLength(2);
  });
});

describe("benchCheck", () => {
  it("passes 30 minutes with signal and level on nearly every reading", () => {
    expect(benchCheck({ readings: 60, spanS: 1800, withRssi: 60, withLevel: 59 }).verdict).toBe("passed");
  });

  it("the Oct 1 batch: 1–11 readings is too short", () => {
    expect(benchCheck({ readings: 2, spanS: 30, withRssi: 2, withLevel: 2 })).toEqual({ verdict: "short", text: "Too short · 2 readings" });
    expect(benchCheck({ readings: 11, spanS: 300, withRssi: 11, withLevel: 11 }).text).toBe("Too short · 11 readings over 5 min");
  });

  it("long enough but never joined wifi does not pass", () => {
    expect(benchCheck({ readings: 120, spanS: 3600, withRssi: 0, withLevel: 120 }).verdict).toBe("short");
  });

  it("no readings at all", () => {
    expect(benchCheck({ readings: 0, spanS: 0, withRssi: 0, withLevel: 0 }).verdict).toBe("none");
  });
});

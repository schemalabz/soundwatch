import { describe, expect, it } from "vitest";
import { groupBoxes, type TokenRow } from "./inventory";

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


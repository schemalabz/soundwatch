import { describe, expect, it } from "vitest";
import { agoEl, installStrings } from "./install";

describe("agoEl", () => {
  it("under 90 seconds reads as a few seconds", () => {
    expect(agoEl(0)).toBe("λίγα δευτερόλεπτα");
    expect(agoEl(89)).toBe("λίγα δευτερόλεπτα");
  });
  it("under 90 minutes reads in minutes, singular at 1", () => {
    expect(agoEl(90)).toBe("1 λεπτό");
    expect(agoEl(120)).toBe("2 λεπτά");
    expect(agoEl(89 * 60)).toBe("89 λεπτά");
  });
  it("under 36 hours reads in hours, singular at 1", () => {
    expect(agoEl(90 * 60)).toBe("1 ώρα");
    expect(agoEl(2 * 3600)).toBe("2 ώρες");
    expect(agoEl(35 * 3600)).toBe("35 ώρες");
  });
  it("36 hours or more reads in days, singular at 1", () => {
    expect(agoEl(36 * 3600)).toBe("1 ημέρα");
    expect(agoEl(2 * 24 * 3600)).toBe("2 ημέρες");
    expect(agoEl(622449)).toBe("7 ημέρες");
  });
});

describe("installStrings.lastReading", () => {
  it("renders using agoEl", () => {
    expect(installStrings.lastReading(622449)).toBe("τελευταία μέτρηση πριν από 7 ημέρες");
  });
});

describe("installStrings.setupReading", () => {
  it("renders the only-bench-check message with a date", () => {
    expect(installStrings.setupReading("1 Οκτ")).toBe(
      "Η μόνη του μέτρηση μέχρι τώρα ήταν στη ρύθμιση, στο γραφείο (1 Οκτ)."
    );
  });
});

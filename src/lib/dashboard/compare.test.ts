import { describe, expect, it } from "vitest";
import { COMPARE_COLORS, MAX_COMPARE, toggleCompare } from "./compare";

describe("toggleCompare", () => {
  it("adds in order and removes on a second toggle", () => {
    expect(toggleCompare([], "a")).toEqual(["a"]);
    expect(toggleCompare(["a", "b"], "a")).toEqual(["b"]);
  });

  it("ignores additions beyond the limit but still removes", () => {
    const full = ["a", "b", "c", "d"];
    expect(full).toHaveLength(MAX_COMPARE);
    expect(toggleCompare(full, "e")).toEqual(full);
    expect(toggleCompare(full, "c")).toEqual(["a", "b", "d"]);
  });

  it("has a colour for every slot", () => {
    expect(COMPARE_COLORS).toHaveLength(MAX_COMPARE);
  });
});

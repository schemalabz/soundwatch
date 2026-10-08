import { describe, expect, it } from "vitest";
import { formatSuggestion } from "./geocode";

describe("formatSuggestion", () => {
  it("street and number, then the area without the region suffix", () => {
    expect(formatSuggestion({ name: "Κυδωνιών 34", context: { place: { name: "Νέα Ιωνία Αττικής" } } }))
      .toBe("Κυδωνιών 34, Νέα Ιωνία");
    expect(formatSuggestion({ name: "Λακωνίας 19", context: { place: { name: "Δάφνη Αττικής" } } }))
      .toBe("Λακωνίας 19, Δάφνη");
  });
  it("works with parts missing, and gives up without a street", () => {
    expect(formatSuggestion({ name: "Σίφνου 6", context: { place: { name: "Αθήνα" } } }))
      .toBe("Σίφνου 6, Αθήνα");
    expect(formatSuggestion({ name: "Σίφνου 6" })).toBe("Σίφνου 6");
    expect(formatSuggestion({})).toBeNull();
  });
});

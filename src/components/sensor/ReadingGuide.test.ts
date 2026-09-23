import { describe, expect, it } from "vitest";
import { decodeFragment } from "./ReadingGuide";

// `/sensors/<id>#guide%` used to throw URIError out of the mount effect and
// take the whole page down to "This page couldn't load" — and the fragment
// survives a reload, so the link stayed broken for whoever was sent it.
describe("decodeFragment", () => {
  it("returns the raw text for a fragment it cannot decode", () => {
    expect(decodeFragment("guide%")).toBe("guide%");
    expect(decodeFragment("guide-%")).toBe("guide-%");
    expect(decodeFragment("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("still decodes a well-formed one", () => {
    expect(decodeFragment("guide")).toBe("guide");
    expect(decodeFragment("guide-l10")).toBe("guide-l10");
    expect(decodeFragment("guide-%CE%BB")).toBe("guide-λ");
  });
});

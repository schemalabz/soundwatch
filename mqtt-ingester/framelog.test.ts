import { describe, it, expect } from "vitest";
import { parseFrameLogChunk } from "./framelog";

describe("parseFrameLogChunk", () => {
  it("parses a legacy chunk (no day tag)", () => {
    const c = parseFrameLogChunk("1440|118,117,119\r\n1785697953,120");
    expect(c).toEqual({ kind: "chunk", day: "", offset: 1440, data: "118,117,119\r\n1785697953,120" });
  });
  it("parses a day-tagged chunk", () => {
    const c = parseFrameLogChunk("260803|1440|118,117");
    expect(c).toEqual({ kind: "chunk", day: "260803", offset: 1440, data: "118,117" });
  });
  it("parses both EOF forms", () => {
    expect(parseFrameLogChunk("EOF|86544")).toEqual({ kind: "eof", day: "", size: 86544 });
    expect(parseFrameLogChunk("EOF|260803|86544")).toEqual({ kind: "eof", day: "260803", size: 86544 });
  });
  it("keeps numeric-looking data intact when the offset is the head", () => {
    // "123456" is a valid day tag shape — disambiguation relies on position
    const c = parseFrameLogChunk("123456|99|data");
    expect(c).toEqual({ kind: "chunk", day: "123456", offset: 99, data: "data" });
  });
  it("rejects garbage without ever throwing", () => {
    expect(parseFrameLogChunk("")).toBeNull();
    expect(parseFrameLogChunk("no-separator")).toBeNull();
    expect(parseFrameLogChunk("-5|data")).toBeNull();
    expect(parseFrameLogChunk("EOF|nonsense")).toBeNull();
  });
  it("keeps data containing pipes intact (legacy head is not 6 digits)", () => {
    const c = parseFrameLogChunk("0|a|b|c");
    expect(c).toEqual({ kind: "chunk", day: "", offset: 0, data: "a|b|c" });
  });
});

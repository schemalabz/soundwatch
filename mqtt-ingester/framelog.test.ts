import { describe, it, expect } from "vitest";
import { parseFrameLogChunk } from "./framelog";

describe("parseFrameLogChunk", () => {
  it("parses a data chunk with offset prefix", () => {
    const c = parseFrameLogChunk("1440|118,117,119\r\n1785697953,120");
    expect(c).toEqual({ kind: "chunk", offset: 1440, data: "118,117,119\r\n1785697953,120" });
  });
  it("parses the EOF marker", () => {
    expect(parseFrameLogChunk("EOF|86544")).toEqual({ kind: "eof", size: 86544 });
  });
  it("rejects garbage without ever throwing", () => {
    expect(parseFrameLogChunk("")).toBeNull();
    expect(parseFrameLogChunk("no-separator")).toBeNull();
    expect(parseFrameLogChunk("-5|data")).toBeNull();
    expect(parseFrameLogChunk("EOF|nonsense")).toBeNull();
  });
  it("keeps data containing pipes intact", () => {
    const c = parseFrameLogChunk("0|a|b|c");
    expect(c).toEqual({ kind: "chunk", offset: 0, data: "a|b|c" });
  });
});

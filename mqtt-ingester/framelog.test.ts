import { describe, it, expect } from "vitest";
import { parseFrameLogChunk } from "./framelog";

// Real body bytes from a device's FL file: digits and commas, never a "|".
const BODY = "1785773070,107,108,106,111,116,112,109,112,98";

describe("parseFrameLogChunk", () => {
  it("parses a day-tagged chunk", () => {
    expect(parseFrameLogChunk(`260803|1440|118,117`)).toEqual({
      kind: "chunk", day: "260803", offset: 1440, data: "118,117",
    });
  });

  it("parses a day-tagged EOF", () => {
    expect(parseFrameLogChunk("EOF|260803|86544")).toEqual({ kind: "eof", day: "260803", size: 86544 });
  });

  // serve-mute regression. The offset here is six digits, which used to be
  // read as a day tag when both namespaces were supported. With one format
  // the first field is unambiguously the day, so offset size is irrelevant.
  it("parses a chunk at any offset size", () => {
    for (const off of [0, 99720, 100080, 999999, 1000080, 16334216]) {
      expect(parseFrameLogChunk(`260806|${off}|${BODY}`)).toEqual({
        kind: "chunk", day: "260806", offset: off, data: BODY,
      });
    }
  });

  it("keeps data containing pipes intact", () => {
    expect(parseFrameLogChunk("260806|0|a|b|c")).toEqual({
      kind: "chunk", day: "260806", offset: 0, data: "a|b|c",
    });
  });

  // The legacy single-file namespace ("<off>|<bytes>", no day tag) is retired.
  // No unit in the fleet serves it, and accepting it is what made the wire
  // format ambiguous in the first place.
  it("rejects an untagged legacy chunk", () => {
    expect(parseFrameLogChunk(`100080|${BODY}`)).toBeNull();
    expect(parseFrameLogChunk(`99720|${BODY}`)).toBeNull();
  });

  it("rejects an untagged legacy EOF", () => {
    expect(parseFrameLogChunk("EOF|16334576")).toBeNull();
  });

  it("rejects a first field that cannot be a date", () => {
    expect(parseFrameLogChunk(`123456|99|${BODY}`)).toBeNull();   // month 34
    expect(parseFrameLogChunk(`260800|99|${BODY}`)).toBeNull();   // day 00
    expect(parseFrameLogChunk(`261301|99|${BODY}`)).toBeNull();   // month 13
  });

  it("rejects a second field that is not a bare offset", () => {
    expect(parseFrameLogChunk("260806|not-a-number|data")).toBeNull();
    expect(parseFrameLogChunk("260806|-5|data")).toBeNull();
  });

  it("rejects garbage without ever throwing", () => {
    expect(parseFrameLogChunk("")).toBeNull();
    expect(parseFrameLogChunk("no-separator")).toBeNull();
    expect(parseFrameLogChunk("EOF|nonsense")).toBeNull();
    expect(parseFrameLogChunk("EOF|260803|nonsense")).toBeNull();
  });
});

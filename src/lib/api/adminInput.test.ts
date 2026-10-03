import { describe, expect, it } from "vitest";
import { checkFields, parseLatLon, readBody } from "./adminInput";

const req = (raw: string) => new Request("https://x/y", { method: "POST", body: raw });

describe("admin request bodies", () => {
  it("reads an object, treats an empty body as {}, and rejects null and arrays", async () => {
    expect(await readBody(req('{"a":1}'))).toEqual({ a: 1 });
    expect(await readBody(req(""))).toEqual({});
    expect(await readBody(req("null"))).toBeNull();
    expect(await readBody(req("[1]"))).toBeNull();
  });
  it("names unknown and wrongly typed fields", () => {
    expect(checkFields({ undo: "false" }, { undo: "boolean" })).toBe("undo must be a boolean");
    expect(checkFields({ undo: true, x: 1 }, { undo: "boolean" })).toBe("Unknown field(s): x");
    expect(checkFields({ address: null }, { address: "string|null" })).toBeNull();
  });
  it("coordinates must be real numbers, in range, and not 0,0", () => {
    expect(parseLatLon(37.9, 23.7)).toEqual({ latitude: 37.9, longitude: 23.7 });
    expect(parseLatLon("", "")).toBeNull();
    expect(parseLatLon(null, 23.7)).toBeNull();
    expect(parseLatLon(0, 0)).toBeNull();
    expect(parseLatLon(91, 23.7)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readingRow } from "./fixtures";
import { serializeReading } from "./readings";
import { ReadingSchema, ReadingsQuerySchema } from "./schemas";

describe("serializeReading", () => {
  it("produces the documented shape (round-trips through ReadingSchema)", () => {
    const api = ReadingSchema.parse(serializeReading(readingRow()));
    expect(api.laeq).toBe(86.99);
    expect(api.topBinCensored).toBe(true);
    expect(api.bottomBinCensored).toBe(false);
    expect(api.hist).toHaveLength(30);
    expect(api.recordedAt).toBe("2026-08-12T10:00:00.000Z");
    expect(api.receivedAt).toBe("2026-08-12T10:00:05.000Z");
    expect(api.payloadVersion).toBe(4);
  });

  it("keeps noiseDba as a deprecated alias of laeq", () => {
    expect(serializeReading(readingRow()).noiseDba).toBe(86.99);
    // A genuine stock noise_dba value (never the case under Soundwatch
    // firmware, but present on legacy rows) is passed through.
    expect(
      serializeReading(readingRow({ noiseDba: 44.0, laeq: null })).noiseDba
    ).toBe(44.0);
  });

  it("nulls the censoring flags when there is no histogram", () => {
    const api = serializeReading(readingRow({ histRaw: null }));
    expect(api.topBinCensored).toBeNull();
    expect(api.bottomBinCensored).toBeNull();
    expect(api.hist).toBeNull();
  });
});

describe("ReadingsQuerySchema", () => {
  it("parses valid params", () => {
    const q = ReadingsQuerySchema.parse({
      from: "2026-08-01T00:00:00Z",
      limit: "500",
    });
    expect(q.limit).toBe(500);
    expect(q.from).toBe("2026-08-01T00:00:00Z");
  });

  it("accepts an empty query", () => {
    expect(ReadingsQuerySchema.parse({})).toEqual({});
  });

  it("rejects a non-numeric or out-of-range limit", () => {
    expect(ReadingsQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(ReadingsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(ReadingsQuerySchema.safeParse({ limit: "20000" }).success).toBe(false);
  });

  it("rejects an unparsable date", () => {
    expect(ReadingsQuerySchema.safeParse({ from: "yesterday-ish" }).success).toBe(
      false
    );
  });
});

describe("caveats live in the field descriptions", () => {
  const json = JSON.stringify(z.toJSONSchema(ReadingSchema));
  it("laeq says it is not dB(A)", () => {
    expect(json).toContain("NOT dB(A)");
  });
  it("l10 points at topBinCensored", () => {
    expect(json).toContain("topBinCensored");
  });
  it("noiseDba is marked deprecated", () => {
    const props = z.toJSONSchema(ReadingSchema).properties as Record<
      string,
      { deprecated?: boolean }
    >;
    expect(props.noiseDba.deprecated).toBe(true);
  });
});

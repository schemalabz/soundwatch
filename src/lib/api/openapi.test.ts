import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi";

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument();
  const text = JSON.stringify(doc);

  it("documents the three public endpoints", () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/api/sensors",
      "/api/sensors/{id}",
      "/api/sensors/{id}/readings",
    ]);
  });

  it("is OpenAPI 3.1", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("carries the calibration caveat in field descriptions", () => {
    expect(text).toContain("NOT dB(A)");
    expect(text).toContain("device-dB");
  });

  it("carries the censoring caveat next to the percentiles", () => {
    expect(text).toContain("topBinCensored");
    expect(text).toContain("MAY BE CENSORED");
  });

  it("marks noiseDba deprecated", () => {
    expect(text).toContain('"deprecated":true');
  });

  it("documents the readings query parameters", () => {
    expect(text).toContain('"name":"limit"');
    expect(text).toContain('"name":"from"');
  });
});

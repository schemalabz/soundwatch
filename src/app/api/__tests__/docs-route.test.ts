import { describe, expect, it } from "vitest";
import { GET as getSpec } from "../openapi.json/route";
import { GET as getDocs } from "../docs/route";

describe("GET /api/openapi.json", () => {
  it("serves the generated document", async () => {
    const res = await getSpec();
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/api/sensors/{id}/readings"]).toBeDefined();
  });
});

describe("GET /api/docs", () => {
  it("serves an HTML page that loads the spec", async () => {
    const res = await getDocs();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("/api/openapi.json");
  });
});

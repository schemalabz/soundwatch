import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, readingsUrl, sensorPagePath, sensorShareUrl } from "./api";
import { SHARE_KEY_PARAM } from "@/lib/api/schemas";

// The two clocks are the whole point of this module: `from` filters the DEVICE
// clock, `receivedFrom` the SERVER clock. The live page windows on arrival, so
// anything that has to agree with the log — the CSV above all — must ask for
// `receivedFrom`. These tests pin that, because the two produce URLs that look
// equally plausible and differ only in which rows come back.

const FROM_MS = Date.UTC(2026, 8, 22, 6, 29, 39);
const ISO = "2026-09-22T06:29:39.000Z";

function query(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

describe("readingsUrl", () => {
  it("sends receivedFromMs as receivedFrom, never as from", () => {
    const q = query(readingsUrl("s1", null, { receivedFromMs: FROM_MS }));
    expect(q.get("receivedFrom")).toBe(ISO);
    expect(q.get("from")).toBe(null);
  });

  it("sends fromMs as from, never as receivedFrom", () => {
    const q = query(readingsUrl("s1", null, { fromMs: FROM_MS }));
    expect(q.get("from")).toBe(ISO);
    expect(q.get("receivedFrom")).toBe(null);
  });

  it("omits the query string entirely when there is nothing to ask for", () => {
    expect(readingsUrl("s1", null)).toBe("/api/sensors/s1/readings");
  });

  it("carries the share key when there is one", () => {
    expect(query(readingsUrl("s1", "k3y", { limit: 20 })).get(SHARE_KEY_PARAM)).toBe("k3y");
  });
});

describe("sensorPagePath / sensorShareUrl", () => {
  it("spells the live page's path once", () => {
    expect(sensorPagePath("s1")).toBe("/sensors/s1");
  });

  it("encodes the key instead of concatenating it into the query", () => {
    const url = new URL(sensorShareUrl("s1", "a+b/c=", "https://soundwatch.example"));
    expect(url.pathname).toBe("/sensors/s1");
    // The point of the builder: searchParams round-trips the key byte for
    // byte, where `?k=${key}` would hand the gate "a b/c=".
    expect(url.searchParams.get(SHARE_KEY_PARAM)).toBe("a+b/c=");
    expect(url.search).toContain("a%2Bb%2Fc%3D");
  });
});

describe("downloadCsv", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for csv over the same arrival window the log is trimmed to", async () => {
    let requested = "";
    const anchor = { href: "", download: "", click: () => {}, remove: () => {} };
    vi.stubGlobal("fetch", async (input: string) => {
      requested = input;
      return {
        ok: true,
        headers: { get: () => `attachment; filename="soundwatch.csv"` },
        blob: async () => new Blob(["recorded_at\n"]),
      } as unknown as Response;
    });
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: () => {} } });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: () => {} });

    await downloadCsv("s1", null, FROM_MS);

    const q = query(requested);
    expect(requested.startsWith("/api/sensors/s1/readings?")).toBe(true);
    expect(q.get("format")).toBe("csv");
    // The regression this file exists for: a CSV filtered on `from` is a
    // different set of rows from the table the user is looking at.
    expect(q.get("receivedFrom")).toBe(ISO);
    expect(q.get("from")).toBe(null);
  });
});

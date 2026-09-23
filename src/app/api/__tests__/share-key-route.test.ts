import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { DELETE, POST } from "../admin/sensors/[id]/share-key/route";

const mocked = vi.mocked(prisma, true);
const SENSOR = { id: "b1", deviceId: "bench3", isExperimental: true, shareKey: null };

function call(method: "POST" | "DELETE", headers: Record<string, string> = {}) {
  const fn = method === "POST" ? POST : DELETE;
  return fn(new Request("https://soundwatch.gr/api/admin/sensors/b1/share-key", { method, headers }), {
    params: Promise.resolve({ id: "b1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = "secret";
  delete process.env.NEXT_PUBLIC_BASE_URL;
  mocked.sensor.findUnique.mockResolvedValue(SENSOR as never);
  mocked.sensor.update.mockImplementation(
    (async (args: { data: object }) => ({ ...SENSOR, ...args.data })) as never
  );
});

describe("share-key route", () => {
  it("requires the admin token", async () => {
    expect((await call("POST")).status).toBe(401);
    expect((await call("DELETE")).status).toBe(401);
  });

  it("mints a fresh key and returns the page URL", async () => {
    const res = await call("POST", { authorization: "Bearer secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shareKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body.url).toBe(`https://soundwatch.gr/sensors/b1?k=${body.shareKey}`);
    expect(mocked.sensor.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { shareKey: body.shareKey } });
  });

  it("rotates: a second mint returns a different key", async () => {
    const a = await (await call("POST", { authorization: "Bearer secret" })).json();
    const b = await (await call("POST", { authorization: "Bearer secret" })).json();
    expect(a.shareKey).not.toBe(b.shareKey);
  });

  it("revokes by setting the key null", async () => {
    const res = await call("DELETE", { authorization: "Bearer secret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shareKey: null });
    expect(mocked.sensor.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { shareKey: null } });
  });

  it("404s an unknown sensor", async () => {
    mocked.sensor.findUnique.mockResolvedValue(null as never);
    expect((await call("POST", { authorization: "Bearer secret" })).status).toBe(404);
    expect((await call("DELETE", { authorization: "Bearer secret" })).status).toBe(404);
  });

  it("never rotates the key when the link cannot be built", async () => {
    // `new URL` throws on a scheme-less base, and NEXT_PUBLIC_BASE_URL=
    // soundwatch.gr is the natural way to get that wrong. Building after the
    // update meant Rotate killed the expert's working link, answered 500, and
    // never surfaced the replacement.
    process.env.NEXT_PUBLIC_BASE_URL = "soundwatch.gr";
    const res = await POST(
      new Request("http://0.0.0.0:3000/api/admin/sensors/b1/share-key", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      }),
      { params: Promise.resolve({ id: "b1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Falls back to the request origin rather than throwing: an admin can
    // correct the host by hand, and the key that was minted is the key the
    // database now holds.
    expect(body.url).toBe(`http://0.0.0.0:3000/sensors/b1?k=${body.shareKey}`);
    expect(mocked.sensor.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { shareKey: body.shareKey },
    });
  });

  it("builds the link on NEXT_PUBLIC_BASE_URL when deployment sets it", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://soundwatch.gr";
    const res = await POST(new Request("http://0.0.0.0:3000/api/admin/sensors/b1/share-key", { method: "POST", headers: { authorization: "Bearer secret" } }), { params: Promise.resolve({ id: "b1" }) });
    const body = await res.json();
    expect(body.url).toBe(`https://soundwatch.gr/sensors/b1?k=${body.shareKey}`);
  });
});

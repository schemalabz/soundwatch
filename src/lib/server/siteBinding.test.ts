import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadSiteForBinding, occupants } from "./siteBinding";

const site = (sensors: { deviceId: string; retiredAt: Date | null; isActive: boolean }[], isActive = true) => ({
  plannedLocation: { findUnique: vi.fn(async () => ({ id: "p1", name: "Skroutz Δάφνη", address: "Δάφνη 1", latitude: 37.9, longitude: 23.7, isActive, sensors })) },
}) as unknown as PrismaClient;

describe("loadSiteForBinding", () => {
  it("retired and hidden tokens, and the unit itself, do not occupy the site", async () => {
    const r = await loadSiteForBinding(site([
      { deviceId: "me", retiredAt: null, isActive: true },
      { deviceId: "old-self", retiredAt: new Date(), isActive: false },
      { deviceId: "legacy-hidden", retiredAt: null, isActive: false },
      { deviceId: "retired-but-flag-on", retiredAt: new Date(), isActive: true },
      { deviceId: "other", retiredAt: null, isActive: true },
    ]), "p1", { deviceId: "me" });
    expect(r).toEqual({ ok: true, site: { id: "p1", name: "Skroutz Δάφνη", address: "Δάφνη 1", latitude: 37.9, longitude: 23.7 }, occupiedBy: ["other"] });
  });
  it("a retired site is refused", async () => {
    expect(await loadSiteForBinding(site([], false), "p1", { deviceId: "me" })).toEqual({ ok: false, error: "unknown or retired planned location" });
  });
  it("occupants: other tokens that are neither retired nor hidden", () => {
    const s = (deviceId: string, retiredAt: Date | null, isActive: boolean) => ({ deviceId, retiredAt, isActive });
    expect(occupants([s("me", null, true), s("old", new Date(), false), s("hidden", null, false), s("live", null, true)], "me").map((x) => x.deviceId))
      .toEqual(["live"]);
  });
});

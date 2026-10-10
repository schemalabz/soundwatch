// Binding a unit to a planned site — shared by the installer's flow
// (/api/install/[token]/location) and the admin's "link to a site"
// (/api/admin/sensors/[id]/site), so the two cannot drift on what a valid
// site is or who counts as already being there.
import type { PrismaClient } from "@prisma/client";

export interface BindableSite {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export type SiteLookup =
  | { ok: true; site: BindableSite; occupiedBy: string[] }
  | { ok: false; error: "unknown or retired planned location" };

/** Who occupies a site: the OTHER tokens bound to it that are neither retired
 *  nor hidden. Shared with the installer's site picker. */
export function occupants<T extends { deviceId: string; retiredAt: Date | null; isActive: boolean }>(sensors: T[], self: string): T[] {
  return sensors.filter((s) => s.deviceId !== self && !s.retiredAt && s.isActive);
}

/**
 * The site, if it can take a unit, and which OTHER units are bound to it.
 * Retired tokens do not occupy anything: a box re-provisioned under a new
 * token must not be warned away from its own site by its old self.
 */
export async function loadSiteForBinding(
  prisma: PrismaClient,
  siteId: string,
  sensor: { deviceId: string },
): Promise<SiteLookup> {
  const found = await prisma.plannedLocation.findUnique({
    where: { id: siteId },
    include: { sensors: { select: { deviceId: true, retiredAt: true, isActive: true } } },
  });
  if (!found || !found.isActive) return { ok: false, error: "unknown or retired planned location" };
  const occupiedBy = occupants(found.sensors, sensor.deviceId).map((s) => s.deviceId);
  const { id, name, address, latitude, longitude } = found;
  return { ok: true, site: { id, name, address, latitude, longitude }, occupiedBy };
}

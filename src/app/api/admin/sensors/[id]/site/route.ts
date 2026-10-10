import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadSiteForBinding } from "@/lib/server/siteBinding";
import { checkFields, parseLatLon, readBody, type Body } from "@/lib/api/adminInput";
import { checkAdminAuth } from "../../../auth";

/**
 * Where a unit is, set by the admin after the fact.
 *
 *   { siteId, acceptOccupied?, movePin? }               link to a planned site
 *                                                        …and move the unit's pin to the site
 *   { custom: { name, address?, latitude, longitude } } an unplanned location
 *   { unlink: true }                                    drop the site link, keep the rest
 *
 * Copy-on-bind, as at install: the site's name and address are copied onto
 * the unit. The unit keeps its own GPS unless movePin, or it has none.
 * installed_at is never touched: linking a unit days after install must not
 * rewrite when it went up.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Send a JSON object" }, { status: 400 });
  const bad = checkFields(body, { siteId: "string", acceptOccupied: "boolean", movePin: "boolean", custom: "object", unlink: "boolean" });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const modes = ["siteId", "custom", "unlink"].filter((k) => k in body);
  if (modes.length !== 1 || body.unlink === false) {
    return NextResponse.json({ error: "send exactly one of siteId, custom, or unlink: true" }, { status: 400 });
  }

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) return NextResponse.json({ error: "Sensor not found" }, { status: 404 });

  if (body.unlink) {
    return NextResponse.json(await prisma.sensor.update({ where: { id }, data: { plannedLocationId: null } }));
  }

  if (typeof body.siteId === "string") {
    const found = await loadSiteForBinding(prisma, body.siteId, sensor);
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: 400 });
    if (found.occupiedBy.length > 0 && body.acceptOccupied !== true) {
      return NextResponse.json(
        { error: "site occupied", occupiedBy: found.occupiedBy,
          detail: "This site already has a unit. Re-send with acceptOccupied:true to link anyway (e.g. replacing a dead unit)." },
        { status: 409 },
      );
    }
    const { site } = found;
    const pin = body.movePin === true || sensor.latitude == null || sensor.longitude == null;
    return NextResponse.json(await prisma.sensor.update({
      where: { id },
      data: {
        plannedLocationId: site.id,
        name: site.name,
        address: site.address,
        ...(pin ? { latitude: site.latitude, longitude: site.longitude } : {}),
      },
    }));
  }

  const custom = body.custom as Body;
  const badCustom = checkFields(custom, { name: "string", address: "string|null", latitude: "number", longitude: "number" });
  const at = parseLatLon(custom.latitude, custom.longitude);
  const name = typeof custom.name === "string" ? custom.name.trim() : "";
  const address = typeof custom.address === "string" ? custom.address.trim() : "";
  if (badCustom || !at || !name || name.length > 120 || address.length > 200) {
    return NextResponse.json({ error: badCustom ?? "custom needs a name (≤120), an address (≤200) and real coordinates" }, { status: 400 });
  }
  return NextResponse.json(await prisma.sensor.update({
    where: { id },
    data: { plannedLocationId: null, name, address: address || null, ...at },
  }));
}

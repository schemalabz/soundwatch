import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../auth";
import { readBody, checkFields, parseLatLon } from "@/lib/api/adminInput";

/**
 * Edit one site. The key (import identity) never changes here. Retire with
 * isActive:false — never deleted, so units bound to it keep their link.
 * Units copied the name/address when they were bound (copy-on-bind); editing
 * the site does not rewrite them.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Send a JSON object" }, { status: 400 });
  const bad = checkFields(body, { name: "string", address: "string|null", notes: "string|null", isActive: "boolean", latitude: "number", longitude: "number" });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    if (!body.name.trim() || body.name.length > 120) return NextResponse.json({ error: "name must be 1–120 characters" }, { status: 400 });
    data.name = body.name.trim();
  }
  for (const k of ["address", "notes"] as const) {
    if (!(k in body)) continue;
    const v = typeof body[k] === "string" ? (body[k] as string).trim() : "";
    if (v.length > 500) return NextResponse.json({ error: `${k} must be at most 500 characters` }, { status: 400 });
    data[k] = v || null;
  }
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if ("latitude" in body || "longitude" in body) {
    const at = parseLatLon(body.latitude, body.longitude);
    if (!at) return NextResponse.json({ error: "Send both latitude and longitude, as real coordinates." }, { status: 400 });
    Object.assign(data, at);
  }

  const site = await prisma.plannedLocation.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json(await prisma.plannedLocation.update({ where: { id }, data }));
}

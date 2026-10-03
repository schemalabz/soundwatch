import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";
import { readBody, checkFields } from "@/lib/api/adminInput";

/**
 * Retire a TOKEN: the row stops counting as a unit, every reading stays.
 *
 *   POST { supersededById? }  retire (optionally: "this box now uses that token")
 *   POST { undo: true }       bring it back
 *
 * isActive goes false with it, so the public filter (PUBLIC_SENSOR_WHERE)
 * needs no change; its previous value is kept, and an undo restores it. Nothing is
 * deleted — that stays the separate, two-phase DELETE on the sensor.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Send a JSON object" }, { status: 400 });
  const bad = checkFields(body, { supersededById: "string|null", undo: "boolean" });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) return NextResponse.json({ error: "Sensor not found" }, { status: 404 });

  if (body.undo) {
    // Only a retirement can be undone, and it restores is_active as it was:
    // a unit that was hidden before it was retired stays hidden.
    if (!sensor.retiredAt) return NextResponse.json({ error: "Not retired" }, { status: 409 });
    const updated = await prisma.sensor.update({
      where: { id },
      data: { retiredAt: null, supersededById: null, isActive: sensor.activeBeforeRetire ?? true, activeBeforeRetire: null },
    });
    return NextResponse.json(updated);
  }
  if (sensor.retiredAt) return NextResponse.json({ error: "Already retired" }, { status: 409 });

  if (body.supersededById != null) {
    const supersededId = body.supersededById as string;
    if (supersededId === id) {
      return NextResponse.json({ error: "A token cannot supersede itself" }, { status: 400 });
    }
    const next = await prisma.sensor.findUnique({ where: { id: supersededId } });
    if (!next) return NextResponse.json({ error: "supersededById: no such sensor" }, { status: 400 });
    // Only the same physical box can take over a token's identity.
    if (sensor.hardwareId && next.hardwareId && sensor.hardwareId !== next.hardwareId) {
      return NextResponse.json({ error: "supersededById is a different box (chip ids differ)" }, { status: 409 });
    }
  }

  const updated = await prisma.sensor.update({
    where: { id },
    data: { retiredAt: new Date(), isActive: false, activeBeforeRetire: sensor.isActive, supersededById: (body.supersededById as string | null) ?? null },
  });
  return NextResponse.json(updated);
}

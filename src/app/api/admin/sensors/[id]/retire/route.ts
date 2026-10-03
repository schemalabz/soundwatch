import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";

/**
 * Retire a TOKEN: the row stops counting as a unit, every reading stays.
 *
 *   POST { supersededById? }  retire (optionally: "this box now uses that token")
 *   POST { undo: true }       bring it back
 *
 * isActive goes false with it, so the public filter (PUBLIC_SENSOR_WHERE)
 * needs no change and an undo restores exactly what was there. Nothing is
 * deleted — that stays the separate, two-phase DELETE on the sensor.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { supersededById?: string; undo?: boolean };

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) return NextResponse.json({ error: "Sensor not found" }, { status: 404 });

  if (body.undo) {
    const updated = await prisma.sensor.update({
      where: { id },
      data: { retiredAt: null, supersededById: null, isActive: true },
    });
    return NextResponse.json(updated);
  }

  if (body.supersededById != null) {
    if (body.supersededById === id) {
      return NextResponse.json({ error: "A token cannot supersede itself" }, { status: 400 });
    }
    const next = await prisma.sensor.findUnique({ where: { id: body.supersededById } });
    if (!next) return NextResponse.json({ error: "supersededById: no such sensor" }, { status: 400 });
    // Only the same physical box can take over a token's identity.
    if (sensor.hardwareId && next.hardwareId && sensor.hardwareId !== next.hardwareId) {
      return NextResponse.json({ error: "supersededById is a different box (chip ids differ)" }, { status: 409 });
    }
  }

  const updated = await prisma.sensor.update({
    where: { id },
    data: { retiredAt: new Date(), isActive: false, supersededById: body.supersededById ?? null },
  });
  return NextResponse.json(updated);
}

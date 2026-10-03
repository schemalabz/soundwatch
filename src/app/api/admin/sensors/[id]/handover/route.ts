import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";
import { readBody, checkFields } from "@/lib/api/adminInput";

/**
 * Mark a boxed unit as handed to the installer (POST {}), or take it back
 * (POST { undo: true }). Only for units not yet installed: once installed,
 * the hand-over is history and stays as it was.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Send a JSON object" }, { status: 400 });
  const bad = checkFields(body, { undo: "boolean" });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  if (sensor.installedAt) {
    return NextResponse.json({ error: "Already installed" }, { status: 409 });
  }
  const updated = await prisma.sensor.update({
    where: { id },
    data: { handedOverAt: body.undo ? null : new Date() },
  });
  return NextResponse.json(updated);
}

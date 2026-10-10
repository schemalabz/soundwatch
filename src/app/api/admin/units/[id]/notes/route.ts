import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../auth";

const MAX_NOTE = 2000;

/** Add a dated note to a unit: { body }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { body?: unknown };
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (text.length > MAX_NOTE) return NextResponse.json({ error: `at most ${MAX_NOTE} characters` }, { status: 400 });

  if (!(await prisma.sensor.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }
  const note = await prisma.unitNote.create({ data: { sensorId: id, body: text } });
  return NextResponse.json({ id: String(note.id), body: note.body, createdAt: note.createdAt.toISOString() }, { status: 201 });
}

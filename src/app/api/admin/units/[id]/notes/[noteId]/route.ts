import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../../../auth";

/** Delete one note (a mistake). Notes are not edited: write a new one instead. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id, noteId } = await params;
  if (!/^\d+$/.test(noteId)) return NextResponse.json({ error: "bad note id" }, { status: 400 });
  const res = await prisma.unitNote.deleteMany({ where: { id: BigInt(noteId), sensorId: id } });
  if (res.count === 0) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

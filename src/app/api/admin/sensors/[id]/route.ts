import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../../auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const sensor = await prisma.sensor.findUnique({ where: { id } });
  if (!sensor) {
    return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  }

  const allowedFields = [
    "name",
    "latitude",
    "longitude",
    "address",
    "isActive",
    "readingIntervalS",
    "targetFirmwareVersion",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  const updated = await prisma.sensor.update({ where: { id }, data });
  return NextResponse.json(updated);
}

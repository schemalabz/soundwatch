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
    // Was missing, and its absence was invisible: an unknown field is dropped
    // and the request still returns 200 with the unchanged sensor, so "flag this
    // bench unit experimental" looked like it had worked while the unit stayed
    // on the public map. Minting has always accepted isExperimental; only the
    // edit path could not change it.
    "isExperimental",
  ] as const;

  const data: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const key of Object.keys(body)) {
    if ((allowedFields as readonly string[]).includes(key)) data[key] = body[key];
    else rejected.push(key);
  }
  // Dropping a field the caller clearly meant is how a no-op passes for success.
  // A 400 naming the field is recoverable; a 200 that changed nothing is not.
  if (rejected.length > 0) {
    return NextResponse.json(
      { error: `Unknown or non-editable field(s): ${rejected.join(", ")}` },
      { status: 400 }
    );
  }

  const updated = await prisma.sensor.update({ where: { id }, data });
  return NextResponse.json(updated);
}

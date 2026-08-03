import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../auth";
import { computeStage, parseImportRows } from "@/lib/locations";

// The site list's source of truth is the operator's spreadsheet. This endpoint
// makes re-import idempotent: upsert by key, never duplicate. Sites absent
// from an import are left untouched (retire explicitly with isActive:false).
export async function PUT(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = parseImportRows(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let created = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const { key, ...data } = row;
    const existing = await prisma.plannedLocation.findUnique({ where: { key } });
    if (existing) {
      await prisma.plannedLocation.update({ where: { key }, data });
      updated++;
    } else {
      await prisma.plannedLocation.create({ data: { key, ...data } });
      created++;
    }
  }
  return NextResponse.json({ created, updated });
}

// Deployment-progress view: every site with who fills it.
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const now = new Date();
  const sites = await prisma.plannedLocation.findMany({
    orderBy: { name: "asc" },
    include: {
      sensors: {
        select: { deviceId: true, provisionedAt: true, installedAt: true, lastSeenAt: true },
      },
    },
  });

  return NextResponse.json(
    sites.map(({ sensors, ...site }) => ({
      ...site,
      filledBy: sensors.map((s) => ({ deviceId: s.deviceId, stage: computeStage(s, now) })),
    }))
  );
}

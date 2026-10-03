import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../auth";
import { computeStage, parseImportRows, slugifyKey } from "@/lib/locations";

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

// One site from the admin UI. Same identity rule as the import: the key is
// the slugified name unless given, and a taken key is a conflict, not an
// overwrite — the UI edits through PATCH /api/admin/locations/[id].
export async function POST(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = parseImportRows(body == null ? null : [body]);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error.replace(/^row 0: /, "") }, { status: 400 });
  const { key, ...data } = parsed.rows[0];
  if (await prisma.plannedLocation.findUnique({ where: { key } })) {
    return NextResponse.json({ error: `a site with key "${key}" already exists` }, { status: 409 });
  }
  const site = await prisma.plannedLocation.create({ data: { key: key || slugifyKey(data.name), ...data } });
  return NextResponse.json(site, { status: 201 });
}

import { NextResponse } from "next/server";
import type { UnitDetailResponse } from "@/lib/api/admin";
import { prisma } from "@/lib/db";
import { adminNow } from "@/lib/server/clock";
import { loadUnit } from "@/lib/server/unit";
import { checkAdminAuth } from "../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const payload: UnitDetailResponse | null = await loadUnit(prisma, id, adminNow());
  if (!payload) return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
  return NextResponse.json(payload);
}

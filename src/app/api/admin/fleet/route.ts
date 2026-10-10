import { NextResponse } from "next/server";
import type { FleetResponse } from "@/lib/api/admin";
import { prisma } from "@/lib/db";
import { adminNow } from "@/lib/server/clock";
import { loadFleet } from "@/lib/server/fleet";
import { checkAdminAuth } from "../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  const payload: FleetResponse = await loadFleet(prisma, adminNow());
  return NextResponse.json(payload);
}

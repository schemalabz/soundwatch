import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../auth";

export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const sensors = await prisma.sensor.findMany({
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const result = sensors.map((sensor) => ({
    ...sensor,
    status: sensor.lastSeenAt
      ? now.getTime() - sensor.lastSeenAt.getTime() < 5 * 60 * 1000
        ? "online"
        : "offline"
      : "never_seen",
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { deviceId, name, latitude, longitude, address } = body;

  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json(
      { error: "deviceId is required" },
      { status: 400 }
    );
  }

  const existing = await prisma.sensor.findUnique({ where: { deviceId } });
  if (existing) {
    return NextResponse.json(
      { error: "Sensor with this deviceId already exists" },
      { status: 409 }
    );
  }

  const sensor = await prisma.sensor.create({
    data: { deviceId, name, latitude, longitude, address },
  });

  return NextResponse.json(sensor, { status: 201 });
}

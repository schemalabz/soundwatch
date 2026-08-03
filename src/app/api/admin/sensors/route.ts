import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "../auth";
import { generateToken } from "@/lib/token";
import { computeStage } from "@/lib/locations";

export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const sensors = await prisma.sensor.findMany({
    orderBy: { createdAt: "desc" },
    include: { plannedLocation: { select: { name: true } } },
  });

  const now = new Date();
  const result = sensors.map((sensor) => ({
    ...sensor,
    status: sensor.lastSeenAt
      ? now.getTime() - sensor.lastSeenAt.getTime() < 5 * 60 * 1000
        ? "online"
        : "offline"
      : "never_seen",
    // Lifecycle stage: unlike `status`, this distinguishes a provisioned unit
    // sitting in a box (which HAS a lastSeenAt from its office prove phase)
    // from a deployed unit that died.
    stage: computeStage(sensor, now),
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { name, latitude, longitude, address, isExperimental } = body;
  let { deviceId } = body;

  // Minting: provisioning calls POST with no deviceId and gets a registered
  // token back. Server-side generation is what makes every token that exists
  // unique AND already registered — inventing them at a keyboard guarantees
  // neither, and the token is the device's only credential.
  if (deviceId === undefined || deviceId === null || deviceId === "") {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateToken();
      if (!(await prisma.sensor.findUnique({ where: { deviceId: candidate } }))) {
        deviceId = candidate;
        break;
      }
    }
    if (!deviceId) {
      return NextResponse.json(
        { error: "Could not mint a unique token; the token space may be exhausted" },
        { status: 503 }
      );
    }
  }

  if (typeof deviceId !== "string") {
    return NextResponse.json({ error: "deviceId must be a string" }, { status: 400 });
  }

  const existing = await prisma.sensor.findUnique({ where: { deviceId } });
  if (existing) {
    return NextResponse.json(
      { error: "Sensor with this deviceId already exists" },
      { status: 409 }
    );
  }

  const sensor = await prisma.sensor.create({
    data: { deviceId, name, latitude, longitude, address,
            isExperimental: isExperimental === true },
  });

  return NextResponse.json(sensor, { status: 201 });
}

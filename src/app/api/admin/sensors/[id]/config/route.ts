import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishMqtt } from "@/lib/mqtt";
import { checkAdminAuth } from "../../../auth";

export async function POST(
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

  if (body.readingIntervalS !== undefined) {
    await prisma.sensor.update({
      where: { id },
      data: { readingIntervalS: body.readingIntervalS },
    });
  }

  const topic = `soundwatch/sensors/${sensor.deviceId}/config`;
  const payload = JSON.stringify(body);

  try {
    await publishMqtt(topic, payload);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to publish config to MQTT", details: String(err) },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, topic, config: body });
}

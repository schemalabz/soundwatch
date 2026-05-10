import mqtt from "mqtt";
import { PrismaClient } from "@prisma/client";
import { extractDeviceId, parseSensorPayload } from "./parser";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const READINGS_TOPIC = "soundwatch/sensors/+/readings";

const prisma = new PrismaClient();

async function upsertSensor(deviceId: string): Promise<string> {
  const sensor = await prisma.sensor.upsert({
    where: { deviceId },
    update: { lastSeenAt: new Date() },
    create: { deviceId },
  });
  return sensor.id;
}

async function handleMessage(topic: string, message: Buffer): Promise<void> {
  const deviceId = extractDeviceId(topic);
  if (!deviceId) {
    console.warn(`Ignoring message on unexpected topic: ${topic}`);
    return;
  }

  const reading = parseSensorPayload(message.toString());
  if (!reading) {
    console.warn(`Failed to parse payload from ${deviceId}`);
    return;
  }

  try {
    const sensorId = await upsertSensor(deviceId);

    await prisma.reading.create({
      data: {
        sensorId,
        recordedAt: reading.recordedAt,
        noiseDba: reading.noiseDba,
        temperature: reading.temperature,
        humidity: reading.humidity,
        lightLux: reading.lightLux,
        pressurePa: reading.pressurePa,
        uvIndex: reading.uvIndex,
        pm1: reading.pm1,
        pm25: reading.pm25,
        pm4: reading.pm4,
        pm10: reading.pm10,
      },
    });

    console.log(
      `Stored reading from ${deviceId}: noise=${reading.noiseDba} dBA`
    );
  } catch (err) {
    console.error(`Failed to store reading from ${deviceId}:`, err);
  }
}

function main(): void {
  console.log(`Connecting to MQTT broker at ${MQTT_BROKER_URL}...`);
  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("Connected to MQTT broker");
    client.subscribe(READINGS_TOPIC, (err) => {
      if (err) {
        console.error("Failed to subscribe:", err);
        process.exit(1);
      }
      console.log(`Subscribed to ${READINGS_TOPIC}`);
    });
  });

  client.on("message", (topic, message) => {
    handleMessage(topic, message).catch((err) => {
      console.error("Unhandled error in message handler:", err);
    });
  });

  client.on("error", (err) => {
    console.error("MQTT connection error:", err);
  });

  client.on("close", () => {
    console.log("MQTT connection closed, reconnecting...");
  });

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    client.end();
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    client.end();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main();

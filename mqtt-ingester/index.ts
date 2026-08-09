import mqtt from "mqtt";
import { PrismaClient } from "@prisma/client";
import { extractDeviceId, parseSensorPayload } from "./parser";
import { deriveReadingRow } from "./row";
import { parseFrameLogChunk } from "./framelog";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
// Stock SmartCitizen firmware readings topic: device/sck/<token>/readings/raw.
// The parser bridges the stock {t,<id>:value} payload to typed columns.
const READINGS_TOPIC = "device/sck/+/readings/raw";
// SD-path v1: devices answer framelog pull requests on this topic.
const FRAMELOG_TOPIC = "device/sck/+/framelog";
// INERT with stock firmware: stock publishes device/sck/<token>/{hello,info},
// never `/status`. Kept for now; a future liveness feature would use the
// hello/info topics instead. handleStatusMessage below is currently unreached.
const STATUS_TOPIC = "soundwatch/sensors/+/status";
const STATUS_TOPIC_REGEX = /^soundwatch\/sensors\/([^/]+)\/status$/;
// Shared registration topic. On boot a device publishes createInfo(): its unique
// chip id, hardware version, MAC and firmware versions. That chip id is the only
// identifier that survives reflash / token change / relocation, so we store it
// to answer "which physical box is this?" and to catch units swapped at install.
const INVENTORY_TOPIC = "device/inventory";
// Per-device info: SAME createInfo() payload as device/inventory, but published
// to device/sck/<token>/info so the TOPIC carries the token. createInfo() itself
// has no token field, so this is the only topic that can link a hardware id to a
// device — device/inventory alone is unattributable.
const INFO_TOPIC = "device/sck/+/info";
const INFO_TOPIC_REGEX = /^device\/sck\/([^/]+)\/info$/;

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

  // All derivation (v2/v3 interval normalization, flavor 1/2 math, diag
  // decode) lives in row.ts, shared with the simulator's bulk backfill.
  const row = deriveReadingRow(reading, new Date());

  try {
    const sensorId = await upsertSensor(deviceId);

    // Replays are exact duplicates by (sensor, recorded_at); the unique
    // constraint rejects them and P2002 is the expected, silent outcome.
    await prisma.reading.create({
      data: { sensorId, ...row, bandsDb: row.bandsDb ?? undefined },
    });

    console.log(
      row.laeq != null
        ? `Stored reading from ${deviceId}: LAeq=${row.laeq.toFixed(1)} dB, ` +
          `duty=${((row.realizedDuty ?? 0) * 100).toFixed(1)}% ` +
          `(frames=${row.frameCount}, ${row.intervalMs != null ? (row.intervalMs / 1000).toFixed(1) : row.intervalS}s)`
        : `Stored reading from ${deviceId}: noise=${row.noiseDba} dBA`
    );
  } catch (err) {
    // P2002 = the (sensor_id, recorded_at) unique constraint rejecting a
    // store-and-forward replay — expected and silent, so a burst of replays
    // after an outage cannot bury real ingest failures in error noise.
    if ((err as { code?: string })?.code === "P2002") return;
    console.error(`Failed to store reading from ${deviceId}:`, err);
  }
}

async function handleStatusMessage(topic: string, message: Buffer): Promise<void> {
  const match = topic.match(STATUS_TOPIC_REGEX);
  if (!match) return;

  const deviceId = match[1];

  try {
    const data = JSON.parse(message.toString());
    if (data.status === "online") {
      await prisma.sensor.updateMany({
        where: { deviceId },
        data: { lastSeenAt: new Date() },
      });
      console.log(`Sensor ${deviceId} came online`);
    } else if (data.status === "offline") {
      console.log(`Sensor ${deviceId} went offline`);
    }
  } catch {
    console.warn(`Failed to parse status message from ${deviceId}`);
  }
}

/**
 * device/inventory — a device announcing itself. Records the unique chip id
 * against the sensor so token -> physical unit is known from the first message.
 *
 * The topic is shared and writable by any client (see mosquitto/acl), so this is
 * a HINT to cross-check against what was provisioned, never proof of identity.
 * We log a mismatch rather than overwriting silently: a hardware id changing
 * under a known token means two boxes were swapped, which otherwise mislabels
 * every reading from both units for the life of the deployment.
 */
async function handleInventoryMessage(topic: string, message: Buffer): Promise<void> {
  try {
    const info = JSON.parse(message.toString());
    const hardwareId: string | undefined = info?.id;
    if (!hardwareId) return;

    // createInfo() carries no token, so the shared device/inventory topic cannot
    // be attributed to a device. Only device/sck/<token>/info can, via the topic.
    const match = topic.match(INFO_TOPIC_REGEX);
    if (!match) {
      console.log(`Inventory (unattributable, no token in topic): hardware ${hardwareId}`);
      return;
    }
    const deviceId = match[1];

    const sensor = await prisma.sensor.findUnique({ where: { deviceId } });
    if (sensor?.hardwareId && sensor.hardwareId !== hardwareId) {
      console.warn(
        `HARDWARE MISMATCH for ${deviceId}: provisioned ${sensor.hardwareId}, ` +
          `now reporting ${hardwareId} — units may have been swapped`
      );
      return;
    }
    await prisma.sensor.upsert({
      where: { deviceId },
      update: { hardwareId, lastSeenAt: new Date() },
      create: { deviceId, hardwareId },
    });
    console.log(`Identity: ${deviceId} -> hardware ${hardwareId}`);
  } catch {
    console.warn("Failed to parse inventory/info message");
  }
}

async function handleFrameLogMessage(topic: string, message: Buffer): Promise<void> {
  const deviceId = topic.split("/")[2];
  if (!deviceId) return;
  const chunk = parseFrameLogChunk(message.toString());
  if (!chunk) {
    console.warn(`framelog: unparseable chunk from ${deviceId}`);
    return;
  }
  if (chunk.kind === "eof") {
    console.log(`framelog: ${deviceId} EOF${chunk.day ? ` day ${chunk.day}` : ""}, file size ${chunk.size} bytes`);
    return;
  }
  // Chunks are immutable raw file bytes: first write wins, replays are no-ops.
  await prisma.frameLogChunk.upsert({
    where: { deviceId_day_offset: { deviceId, day: chunk.day, offset: chunk.offset } },
    update: {},
    create: { deviceId, day: chunk.day, offset: chunk.offset, data: chunk.data },
  });
  console.log(`framelog: ${deviceId}${chunk.day ? ` [${chunk.day}]` : ""} +${chunk.data.length}B @ ${chunk.offset}`);
}

function main(): void {
  console.log(`Connecting to MQTT broker at ${MQTT_BROKER_URL}...`);
  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("Connected to MQTT broker");
    client.subscribe([READINGS_TOPIC, STATUS_TOPIC, INVENTORY_TOPIC, INFO_TOPIC, FRAMELOG_TOPIC], (err) => {
      if (err) {
        console.error("Failed to subscribe:", err);
        process.exit(1);
      }
      console.log(`Subscribed to ${READINGS_TOPIC} and ${STATUS_TOPIC}`);
    });
  });

  client.on("message", (topic, message) => {
    if (topic === INVENTORY_TOPIC || INFO_TOPIC_REGEX.test(topic)) {
      handleInventoryMessage(topic, message).catch((err) => {
        console.error("Unhandled error in inventory handler:", err);
      });
    } else if (topic.endsWith("/framelog")) {
      handleFrameLogMessage(topic, message).catch((err) => {
        console.error("Unhandled error in framelog handler:", err);
      });
    } else if (topic.endsWith("/status")) {
      handleStatusMessage(topic, message).catch((err) => {
        console.error("Unhandled error in status handler:", err);
      });
    } else {
      handleMessage(topic, message).catch((err) => {
        console.error("Unhandled error in message handler:", err);
      });
    }
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

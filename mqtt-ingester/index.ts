import mqtt from "mqtt";
import { PrismaClient } from "@prisma/client";
import { extractDeviceId, parseSensorPayload } from "./parser";
import { computeFlavor1 } from "./flavor1";
import { computePercentiles, decodeBandsDb } from "./flavor2";
import { decodeDiagnostics } from "./diagnostics";
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

  // Payload v3 (id 235 >= 3): id 238 carries MILLISECONDS; v2 carried whole
  // seconds. Normalize once here so everything downstream is exact.
  const intervalMs =
    reading.intervalS == null
      ? null
      : (reading.payloadVersion ?? 2) >= 3
        ? reading.intervalS
        : reading.intervalS * 1000;
  // Flavor 1 (Step 4): turn raw accumulators into LAeq / realized_duty / Lmax-Lmin.
  const f1 = computeFlavor1({ ...reading, intervalMs });
  // Flavor 2: percentiles from the level histogram + band dB from the packed spectrum.
  const pct = reading.histRaw ? computePercentiles(reading.histRaw) : null;
  const bandsDb = reading.bandsRaw ? decodeBandsDb(reading.bandsRaw) : null;
  // Device health telemetry (id 243) — uptime, heap, reset cause, churn counters.
  const diag = decodeDiagnostics(reading.diagRaw);

  try {
    const sensorId = await upsertSensor(deviceId);

    await prisma.reading.create({
      data: {
        sensorId,
        recordedAt: reading.recordedAt, // device clock (when the sound happened)
        receivedAt: new Date(), // server clock (when we persisted it)
        noiseDba: reading.noiseDba,
        temperature: reading.temperature,
        humidity: reading.humidity,
        lightLux: reading.lightLux,
        pressurePa: reading.pressurePa,
        uvA: reading.uvA,
        uvB: reading.uvB,
        uvC: reading.uvC,
        pm1: reading.pm1,
        pm25: reading.pm25,
        pm4: reading.pm4,
        pm10: reading.pm10,
        pn05: reading.pn05,
        pn10: reading.pn10,
        pn25: reading.pn25,
        pn40: reading.pn40,
        pn100: reading.pn100,
        tps: reading.tps,
        battery: reading.battery,
        rssi: reading.rssi,
        sdCard: reading.sdCard,
        // Flavor 1: raw accumulators + computed levels (null on stock firmware).
        payloadVersion: reading.payloadVersion,
        energySum: reading.energySum,
        frameCount: reading.frameCount,
        intervalS: intervalMs != null ? Math.round(intervalMs / 1000) : reading.intervalS,
        intervalMs,
        maxEnergy: reading.maxEnergy,
        minEnergy: reading.minEnergy,
        laeq: f1?.laeq ?? null,
        realizedDuty: f1?.realizedDuty ?? null,
        lmaxEst: f1?.lmaxEst ?? null,
        lminEst: f1?.lminEst ?? null,
        histRaw: reading.histRaw,
        bandsRaw: reading.bandsRaw,
        l10: pct?.l10 ?? null,
        l50: pct?.l50 ?? null,
        l90: pct?.l90 ?? null,
        bandsDb: bandsDb ?? undefined,
        deviceUptimeS: diag?.deviceUptimeS ?? null,
        freeHeapBytes: diag?.freeHeapBytes ?? null,
        resetCause: diag?.resetCause ?? null,
        wifiConnects: diag?.wifiConnects ?? null,
        publishFails: diag?.publishFails ?? null,
        captureFails: diag?.captureFails ?? null,
        i2sReinits: diag?.i2sReinits ?? null,
      },
    });

    console.log(
      f1 && f1.laeq != null
        ? `Stored reading from ${deviceId}: LAeq=${f1.laeq.toFixed(1)} dB, ` +
          `duty=${((f1.realizedDuty ?? 0) * 100).toFixed(1)}% ` +
          `(frames=${reading.frameCount}, ${intervalMs != null ? (intervalMs / 1000).toFixed(1) : reading.intervalS}s)`
        : `Stored reading from ${deviceId}: noise=${reading.noiseDba} dBA`
    );
  } catch (err) {
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
    console.log(`framelog: ${deviceId} EOF, file size ${chunk.size} bytes`);
    return;
  }
  // Chunks are immutable raw file bytes: first write wins, replays are no-ops.
  await prisma.frameLogChunk.upsert({
    where: { deviceId_offset: { deviceId, offset: chunk.offset } },
    update: {},
    create: { deviceId, offset: chunk.offset, data: chunk.data },
  });
  console.log(`framelog: ${deviceId} +${chunk.data.length}B @ ${chunk.offset}`);
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

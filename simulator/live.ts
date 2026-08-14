// Live fleet streamer: one MQTT connection per simulated device with
// clientId = deviceId, publishing the stock wire dialect on the device topic.
// This deliberately exercises the production path end to end — including the
// broker ACL (pattern readwrite device/sck/%c/#), the ingester's parser and
// its per-message insert.

import mqtt, { type MqttClient } from "mqtt";
import { FLEET, phaseOffsetS, type FleetSensor } from "./fleet";
import { generateReading } from "./model";
import { isOnline } from "./outages";
import { buildPayload } from "./payload";
import { hashStr } from "./random";

const MQTT_URL = process.env.SIM_MQTT_URL || process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

/** Deterministic fake SAMD21 chip id, so admin's hardware view populates. */
function hardwareId(deviceId: string): string {
  const h = hashStr(deviceId).toString(16).toUpperCase().padStart(8, "0");
  return `SIM${h}${h}`;
}

export function runLive(): void {
  const intervalS = Number(process.env.SIM_INTERVAL_S || 5);
  if (!Number.isFinite(intervalS) || intervalS < 1) {
    throw new Error(`Invalid SIM_INTERVAL_S=${process.env.SIM_INTERVAL_S}`);
  }

  console.log(`Simulating ${FLEET.length} sensors -> ${MQTT_URL}, every ${intervalS}s`);

  const clients: MqttClient[] = [];
  // mqtt.js emits "connect" on EVERY reconnect; guard so each sensor gets
  // exactly one publish loop, or broker blips would multiply the fleet.
  const looping = new Set<string>();
  let published = 0;
  let dark = 0;
  let minDb = Infinity;
  let maxDb = -Infinity;

  for (const sensor of FLEET) {
    const client = mqtt.connect(MQTT_URL, {
      clientId: sensor.deviceId, // the ACL confines %c to device/sck/%c/#
      clean: true,
    });
    clients.push(client);

    client.on("connect", () => {
      if (looping.has(sensor.deviceId)) return; // reconnect, not first connect
      looping.add(sensor.deviceId);
      // Announce identity once per process, like the firmware's createInfo()
      // on boot. Retained (unlike real firmware) so the ingester picks it up
      // even when it subscribes after the simulator connected. Once only:
      // the ingester bumps lastSeenAt on /info, so re-announcing on every
      // MQTT reconnect would keep outage-dark sensors looking "online".
      client.publish(
        `device/sck/${sensor.deviceId}/info`,
        JSON.stringify({ id: hardwareId(sensor.deviceId), hw_ver: "2.3", mac: "SIM" }),
        { retain: true }
      );
      scheduleNext(client, sensor);
    });
    client.on("error", (err) => {
      console.error(`${sensor.deviceId}: MQTT error:`, err.message);
    });
  }

  // Each sensor publishes on its own grid (k*interval + phase), scheduled
  // against the wall clock so cadence stays drift-free and readings line up
  // exactly with what a backfill over the same period would have produced.
  function scheduleNext(client: MqttClient, sensor: FleetSensor): void {
    const phase = phaseOffsetS(sensor.deviceId, intervalS);
    const nowS = Date.now() / 1000;
    const nextT = (Math.floor((nowS - phase) / intervalS) + 1) * intervalS + phase;
    setTimeout(() => {
      // During an outage the device is simply silent; the MQTT connection
      // staying up is fine — data-level darkness (no readings, stale
      // lastSeenAt) is what the outage model simulates. A disconnected
      // client also skips (no unbounded offline queue): the model is
      // deterministic, so missed history is recoverable via backfill.
      if (!isOnline(sensor.deviceId, nextT) || !client.connected) {
        dark++;
      } else {
        const reading = generateReading(sensor, nextT, intervalS);
        client.publish(`device/sck/${sensor.deviceId}/readings/raw`, buildPayload(reading), { qos: 1 });
        published++;
        minDb = Math.min(minDb, reading.targetLaeq);
        maxDb = Math.max(maxDb, reading.targetLaeq);
      }
      scheduleNext(client, sensor);
    }, Math.max(50, (nextT - nowS) * 1000));
  }

  // One digest line per interval instead of 50 lines of noise.
  setInterval(() => {
    if (published === 0 && dark === 0) return;
    const darkNote = dark > 0 ? `, ${dark} dark` : "";
    console.log(
      `${new Date().toISOString()} published ${published} readings${darkNote}, LAeq ${minDb.toFixed(0)}-${maxDb.toFixed(0)} dB`
    );
    published = 0;
    dark = 0;
    minDb = Infinity;
    maxDb = -Infinity;
  }, intervalS * 1000);

  const shutdown = () => {
    console.log("Shutting down simulator...");
    for (const c of clients) c.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

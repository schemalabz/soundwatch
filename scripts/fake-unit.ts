// A pretend unit for local end-to-end tests: publishes simulator readings
// for one token over MQTT, the way a device does (client id = token, topic
// device/sck/<token>/readings/raw). Uptime and the rest of the health
// telemetry come from the simulator's model (daily 06:00 restart included).
//
//   npx tsx scripts/fake-unit.ts <token> [mqtt://localhost:1883] [intervalS=30]
import mqtt from "mqtt";
import { FLEET } from "../simulator/fleet";
import { generateReading } from "../simulator/model";
import { buildPayload } from "../simulator/payload";

const [token, url = "mqtt://localhost:1883", interval = "30"] = process.argv.slice(2);
if (!token) {
  console.error("usage: fake-unit.ts <token> [broker-url] [intervalS]");
  process.exit(2);
}
const intervalS = Number(interval);
const shape = { ...FLEET[0], deviceId: token };
const client = mqtt.connect(url, { clientId: token, keepalive: 120 });

client.on("connect", () => {
  console.log(`fake-unit ${token}: connected to ${url}`);
  const publish = () => {
    const r = generateReading(shape, Math.floor(Date.now() / 1000), intervalS);
    const payload = buildPayload(r);
    client.publish(`device/sck/${token}/readings/raw`, payload);
  };
  publish();
  setInterval(publish, intervalS * 1000);
});
client.on("error", (err) => console.error("fake-unit error:", err.message));

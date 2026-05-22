import mqtt from "mqtt";

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const broker = getArg("broker", "localhost");
const port = parseInt(getArg("port", "1883"), 10);
const username = getArg("username", "");
const password = getArg("password", "");
const deviceId = getArg("device-id", "sck-test-001");
const apiUrl = getArg("api-url", "http://localhost:3000");
const useTls = port === 8883;

async function main() {
  console.log("=== Soundwatch Connection Test ===\n");
  console.log(`Broker: ${broker}:${port} (TLS: ${useTls})`);
  console.log(`Device: ${deviceId}`);
  console.log(`API: ${apiUrl}\n`);

  // Step 1: Connect to MQTT
  console.log("1. Connecting to MQTT broker...");
  const protocol = useTls ? "mqtts" : "mqtt";
  const client = mqtt.connect(`${protocol}://${broker}:${port}`, {
    username: username || undefined,
    password: password || undefined,
    rejectUnauthorized: useTls,
    connectTimeout: 10000,
  });

  await new Promise<void>((resolve, reject) => {
    client.on("connect", () => {
      console.log("   ✓ Connected to MQTT broker\n");
      resolve();
    });
    client.on("error", (err) => {
      console.log(`   ✗ MQTT connection failed: ${err.message}\n`);
      reject(err);
    });
    setTimeout(() => reject(new Error("Connection timeout")), 10000);
  });

  // Step 2: Publish a test reading
  console.log("2. Publishing test reading...");
  const topic = `soundwatch/sensors/${deviceId}/readings`;
  const payload = JSON.stringify({
    device_id: deviceId,
    firmware_version: "test-0.0.0",
    recorded_at: new Date().toISOString(),
    sensors: [
      { id: "noise_dba", value: 55.5 },
      { id: "temperature", value: 25.0 },
      { id: "humidity", value: 50.0 },
    ],
  });

  await new Promise<void>((resolve, reject) => {
    client.publish(topic, payload, (err) => {
      if (err) {
        console.log(`   ✗ Publish failed: ${err.message}\n`);
        reject(err);
      } else {
        console.log(`   ✓ Published to ${topic}\n`);
        resolve();
      }
    });
  });

  client.end();

  // Step 3: Wait for ingestion
  console.log("3. Waiting 5s for ingestion...");
  await new Promise((r) => setTimeout(r, 5000));

  // Step 4: Verify via API
  console.log("4. Checking API for ingested data...");
  try {
    const res = await fetch(`${apiUrl}/api/sensors`);
    if (!res.ok) {
      console.log(`   ✗ API returned ${res.status}\n`);
      process.exit(1);
    }

    const sensors = await res.json();
    const testSensor = sensors.find(
      (s: { deviceId: string }) => s.deviceId === deviceId
    );

    if (!testSensor) {
      console.log(`   ✗ Sensor ${deviceId} not found in API response\n`);
      process.exit(1);
    }

    if (!testSensor.latestReading) {
      console.log(`   ✗ Sensor found but no readings yet\n`);
      process.exit(1);
    }

    console.log(`   ✓ Sensor ${deviceId} found with latest reading:`);
    console.log(`     noise=${testSensor.latestReading.noiseDba} dBA`);
    console.log(`     temperature=${testSensor.latestReading.temperature}°C\n`);
  } catch (err) {
    console.log(`   ✗ API check failed: ${err}\n`);
    process.exit(1);
  }

  console.log("=== All checks passed ===");
}

main().catch((err) => {
  console.error(`\nTest failed: ${err.message}`);
  process.exit(1);
});

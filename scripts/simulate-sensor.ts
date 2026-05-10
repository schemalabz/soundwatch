import mqtt from "mqtt";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const DEVICE_ID = process.argv[2] || "sck-store-001";
const INTERVAL_S = parseInt(process.argv[3] || "5", 10);

function randomInRange(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function generateReading(): string {
  return JSON.stringify({
    device_id: DEVICE_ID,
    recorded_at: new Date().toISOString(),
    sensors: [
      { id: "noise_dba", value: randomInRange(40, 85) },
      { id: "temperature", value: randomInRange(18, 38) },
      { id: "humidity", value: randomInRange(30, 80) },
      { id: "light_lux", value: randomInRange(50, 1000) },
      { id: "pressure_pa", value: randomInRange(100000, 102000) },
      { id: "uv_index", value: randomInRange(0, 11) },
      { id: "pm1", value: randomInRange(2, 20) },
      { id: "pm25", value: randomInRange(5, 50) },
      { id: "pm4", value: randomInRange(8, 60) },
      { id: "pm10", value: randomInRange(10, 80) },
    ],
  });
}

const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log(`Simulating sensor ${DEVICE_ID} every ${INTERVAL_S}s`);
  console.log(`Publishing to ${MQTT_BROKER_URL}`);

  const publish = () => {
    const topic = `soundwatch/sensors/${DEVICE_ID}/readings`;
    const payload = generateReading();
    client.publish(topic, payload);
    console.log(`Published: noise=${JSON.parse(payload).sensors[0].value} dBA`);
  };

  publish();
  setInterval(publish, INTERVAL_S * 1000);
});

client.on("error", (err) => {
  console.error("MQTT error:", err);
  process.exit(1);
});

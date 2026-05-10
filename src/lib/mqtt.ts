import mqtt from "mqtt";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

export async function publishMqtt(
  topic: string,
  payload: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_BROKER_URL);

    client.on("connect", () => {
      client.publish(topic, payload, (err) => {
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });

    client.on("error", (err) => {
      client.end();
      reject(err);
    });
  });
}

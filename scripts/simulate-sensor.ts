import mqtt from "mqtt";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const INTERVAL_S = parseInt(process.argv[2] || "5", 10);

// Mock Athens locations spread across the city
const ATHENS_SENSORS = [
  { deviceId: "sck-exarchia", name: "Skroutz Exarchia", lat: 37.9868, lng: 23.7342, address: "Stournari 28" },
  { deviceId: "sck-monastiraki", name: "Skroutz Monastiraki", lat: 37.9762, lng: 23.7254, address: "Ifestou 12" },
  { deviceId: "sck-pagkrati", name: "Skroutz Pagkrati", lat: 37.9685, lng: 23.7492, address: "Ymittou 56" },
  { deviceId: "sck-kifisia", name: "Skroutz Kifisia", lat: 38.0745, lng: 23.8103, address: "Kolokotroni 15" },
  { deviceId: "sck-glyfada", name: "Skroutz Glyfada", lat: 37.8607, lng: 23.7533, address: "Gounari 42" },
  { deviceId: "sck-nea-smyrni", name: "Skroutz Nea Smyrni", lat: 37.9441, lng: 23.7135, address: "Omirou 8" },
  { deviceId: "sck-piraeus", name: "Skroutz Piraeus", lat: 37.9475, lng: 23.6432, address: "Iroon Polytechneiou 30" },
  { deviceId: "sck-marousi", name: "Skroutz Marousi", lat: 38.0505, lng: 23.8058, address: "Kifisias 120" },
  { deviceId: "sck-chalandri", name: "Skroutz Chalandri", lat: 38.0214, lng: 23.7987, address: "Andrianou 5" },
  { deviceId: "sck-peristeri", name: "Skroutz Peristeri", lat: 38.0139, lng: 23.6916, address: "Panagi Tsaldari 88" },
  { deviceId: "sck-kallithea", name: "Skroutz Kallithea", lat: 37.9562, lng: 23.6985, address: "Davaki 34" },
  { deviceId: "sck-vyronas", name: "Skroutz Vyronas", lat: 37.9605, lng: 23.7632, address: "Kyprou 22" },
  { deviceId: "sck-zografou", name: "Skroutz Zografou", lat: 37.9735, lng: 23.7712, address: "Papagou 91" },
  { deviceId: "sck-kolonaki", name: "Skroutz Kolonaki", lat: 37.9792, lng: 23.7415, address: "Voukourestiou 18" },
  { deviceId: "sck-syntagma", name: "Skroutz Syntagma", lat: 37.9755, lng: 23.7348, address: "Ermou 40" },
];

function randomInRange(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

// Each sensor gets a base noise level to simulate realistic variation
// Central/busy areas are noisier, suburbs are quieter
const NOISE_PROFILES: Record<string, [number, number]> = {
  "sck-exarchia": [62, 82],
  "sck-monastiraki": [65, 85],
  "sck-syntagma": [60, 78],
  "sck-kolonaki": [55, 72],
  "sck-pagkrati": [50, 68],
  "sck-kallithea": [52, 70],
  "sck-piraeus": [58, 78],
  "sck-nea-smyrni": [48, 65],
  "sck-glyfada": [45, 62],
  "sck-kifisia": [42, 58],
  "sck-marousi": [50, 68],
  "sck-chalandri": [48, 64],
  "sck-peristeri": [55, 72],
  "sck-vyronas": [48, 65],
  "sck-zografou": [46, 63],
};

function generateReading(deviceId: string): string {
  const [minNoise, maxNoise] = NOISE_PROFILES[deviceId] || [50, 70];
  return JSON.stringify({
    device_id: deviceId,
    recorded_at: new Date().toISOString(),
    sensors: [
      { id: "noise_dba", value: randomInRange(minNoise, maxNoise) },
      { id: "temperature", value: randomInRange(22, 35) },
      { id: "humidity", value: randomInRange(30, 65) },
      { id: "light_lux", value: randomInRange(100, 8000) },
      { id: "pressure_pa", value: randomInRange(100800, 101500) },
      { id: "uv_a", value: randomInRange(0, 50) },
      { id: "uv_b", value: randomInRange(0, 5) },
      { id: "uv_c", value: randomInRange(0, 3) },
      { id: "pm1", value: randomInRange(2, 20) },
      { id: "pm25", value: randomInRange(5, 40) },
      { id: "pm4", value: randomInRange(8, 50) },
      { id: "pm10", value: randomInRange(10, 60) },
      { id: "pn05", value: randomInRange(1000, 8000) },
      { id: "pn10", value: randomInRange(1500, 9000) },
      { id: "pn25", value: randomInRange(2000, 9500) },
      { id: "pn40", value: randomInRange(2000, 9500) },
      { id: "pn100", value: randomInRange(2000, 9500) },
      { id: "tps", value: randomInRange(10, 80) },
      { id: "battery", value: randomInRange(20, 100) },
      { id: "rssi", value: randomInRange(-80, -30) },
      { id: "sd_card", value: 1 },
    ],
  });
}

const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log(`Simulating ${ATHENS_SENSORS.length} Athens sensors every ${INTERVAL_S}s`);
  console.log(`Publishing to ${MQTT_BROKER_URL}\n`);

  const publish = () => {
    for (const sensor of ATHENS_SENSORS) {
      const topic = `soundwatch/sensors/${sensor.deviceId}/readings`;
      const payload = generateReading(sensor.deviceId);
      client.publish(topic, payload);
    }
    const sample = JSON.parse(generateReading(ATHENS_SENSORS[0].deviceId));
    console.log(`[${new Date().toLocaleTimeString()}] Published ${ATHENS_SENSORS.length} readings (sample: ${ATHENS_SENSORS[0].name} = ${sample.sensors[0].value} dBA)`);
  };

  publish();
  setInterval(publish, INTERVAL_S * 1000);
});

client.on("error", (err) => {
  console.error("MQTT error:", err);
  process.exit(1);
});

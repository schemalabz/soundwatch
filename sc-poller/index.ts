import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const POLL_INTERVAL_S = parseInt(process.env.POLL_INTERVAL_S || "60", 10);
const SC_API_BASE = "https://api.smartcitizen.me/v0";

// Smart Citizen sensor ID → our field name
const SENSOR_MAP: Record<number, string> = {
  53: "noiseDba",      // Noise Level (dBA)
  55: "temperature",   // Temperature (°C)
  56: "humidity",       // Humidity (%)
  14: "lightLux",      // Light (lux)
  58: "pressurePa",    // Barometric Pressure (kPa → Pa)
  214: "uvA",           // UVA (uW/cm²)
  215: "uvB",           // UVB (uW/cm²)
  216: "uvC",           // UVC (uW/cm²)
  193: "pm1",           // PM1 (µg/m³)
  194: "pm25",          // PM2.5 (µg/m³)
  195: "pm4",           // PM4.0 (µg/m³)
  196: "pm10",          // PM10 (µg/m³)
  197: "pn05",          // PN0.5 (#/0.1l)
  198: "pn10",          // PN1.0 (#/0.1l)
  199: "pn25",          // PN2.5 (#/0.1l)
  200: "pn40",          // PN4.0 (#/0.1l)
  201: "pn100",         // PN10.0 (#/0.1l)
  202: "tps",           // Typical Particle Size (µm)
  10: "battery",        // Battery (%)
  220: "rssi",          // WiFi RSSI (dBm)
  221: "sdCard",        // SD Card presence
};

const UNIT_CONVERSIONS: Record<string, (v: number) => number> = {
  pressurePa: (kpa) => kpa * 1000,
};

interface DeviceMapping {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  scDeviceId: number;
}

async function getDeviceMappings(): Promise<DeviceMapping[]> {
  // Sensors with a scDeviceId stored in the database are polled.
  // For now, we use the SC_DEVICES env var: "deviceId:scId,deviceId:scId,..."
  // Example: SC_DEVICES="sck-exarchia:19629"
  const envDevices = process.env.SC_DEVICES || "";
  if (!envDevices) {
    console.warn("SC_DEVICES env var not set. Nothing to poll.");
    return [];
  }

  const mappings: DeviceMapping[] = [];
  for (const entry of envDevices.split(",")) {
    const [deviceId, scIdStr] = entry.trim().split(":");
    if (!deviceId || !scIdStr) continue;

    const scDeviceId = parseInt(scIdStr, 10);
    if (isNaN(scDeviceId)) continue;

    // Ensure sensor exists in our database
    const sensor = await prisma.sensor.upsert({
      where: { deviceId },
      update: {},
      create: { deviceId },
    });

    mappings.push({
      id: sensor.id,
      deviceId,
      name: sensor.name,
      address: sensor.address,
      latitude: sensor.latitude,
      longitude: sensor.longitude,
      scDeviceId,
    });
  }

  return mappings;
}

async function fetchDevice(scDeviceId: number): Promise<{
  lastReadingAt: string;
  sensors: Array<{ id: number; value: number }>;
  latitude: number;
  longitude: number;
} | null> {
  const res = await fetch(`${SC_API_BASE}/devices/${scDeviceId}`);
  if (!res.ok) {
    console.error(`Failed to fetch SC device ${scDeviceId}: ${res.status}`);
    return null;
  }

  const device = await res.json();
  if (!device.data?.sensors) return null;

  return {
    lastReadingAt: device.last_reading_at,
    sensors: device.data.sensors.map((s: { id: number; value: number }) => ({
      id: s.id,
      value: s.value,
    })),
    latitude: device.data.location?.latitude,
    longitude: device.data.location?.longitude,
  };
}

async function pollDevice(mapping: DeviceMapping): Promise<void> {
  const device = await fetchDevice(mapping.scDeviceId);
  if (!device) return;

  const recordedAt = new Date(device.lastReadingAt);

  // Skip if we already have this reading
  const existing = await prisma.reading.findFirst({
    where: { sensorId: mapping.id, recordedAt },
  });
  if (existing) return;

  // Update sensor metadata from SC if we don't have it
  if (!mapping.latitude && device.latitude) {
    await prisma.sensor.update({
      where: { id: mapping.id },
      data: {
        latitude: device.latitude,
        longitude: device.longitude,
        lastSeenAt: new Date(),
      },
    });
  } else {
    await prisma.sensor.update({
      where: { id: mapping.id },
      data: { lastSeenAt: new Date() },
    });
  }

  // Map SC sensor values to our schema
  const values: Record<string, number> = {};
  for (const s of device.sensors) {
    const fieldName = SENSOR_MAP[s.id];
    if (!fieldName || s.value == null) continue;

    let value = s.value;
    if (UNIT_CONVERSIONS[fieldName]) {
      value = UNIT_CONVERSIONS[fieldName](value);
    }
    values[fieldName] = value;
  }

  await prisma.reading.create({
    data: {
      sensorId: mapping.id,
      recordedAt,
      noiseDba: values.noiseDba ?? null,
      temperature: values.temperature ?? null,
      humidity: values.humidity ?? null,
      lightLux: values.lightLux ?? null,
      pressurePa: values.pressurePa ?? null,
      uvA: values.uvA ?? null,
      uvB: values.uvB ?? null,
      uvC: values.uvC ?? null,
      pm1: values.pm1 ?? null,
      pm25: values.pm25 ?? null,
      pm4: values.pm4 ?? null,
      pm10: values.pm10 ?? null,
      pn05: values.pn05 ?? null,
      pn10: values.pn10 ?? null,
      pn25: values.pn25 ?? null,
      pn40: values.pn40 ?? null,
      pn100: values.pn100 ?? null,
      tps: values.tps ?? null,
      battery: values.battery ?? null,
      rssi: values.rssi ?? null,
      sdCard: values.sdCard ?? null,
    },
  });
  console.log(
    `[${new Date().toLocaleTimeString()}] ${mapping.deviceId}: noise=${values.noiseDba} dBA, temp=${values.temperature}°C`
  );
}

async function poll(mappings: DeviceMapping[]): Promise<void> {
  for (const mapping of mappings) {
    try {
      await pollDevice(mapping);
    } catch (err) {
      console.error(`Error polling ${mapping.deviceId}:`, err);
    }
  }
}

async function main(): Promise<void> {
  const mappings = await getDeviceMappings();
  if (mappings.length === 0) {
    console.error("No devices to poll. Set SC_DEVICES env var.");
    process.exit(1);
  }

  console.log(`Polling ${mappings.length} devices from Smart Citizen API every ${POLL_INTERVAL_S}s:`);
  for (const m of mappings) {
    console.log(`  ${m.deviceId} → SC device ${m.scDeviceId}`);
  }
  console.log("");

  await poll(mappings);
  setInterval(() => poll(mappings), POLL_INTERVAL_S * 1000);

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    await prisma.$disconnect();
    process.exit(0);
  });
}

main();

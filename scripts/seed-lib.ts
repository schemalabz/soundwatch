import { PrismaClient } from "@prisma/client";

export const ATHENS_SENSORS = [
  { deviceId: "sck-exarchia", name: "Skroutz Exarchia", latitude: 37.9868, longitude: 23.7342, address: "Stournari 28" },
  { deviceId: "sck-monastiraki", name: "Skroutz Monastiraki", latitude: 37.9762, longitude: 23.7254, address: "Ifestou 12" },
  { deviceId: "sck-pagkrati", name: "Skroutz Pagkrati", latitude: 37.9685, longitude: 23.7492, address: "Ymittou 56" },
  { deviceId: "sck-kifisia", name: "Skroutz Kifisia", latitude: 38.0745, longitude: 23.8103, address: "Kolokotroni 15" },
  { deviceId: "sck-glyfada", name: "Skroutz Glyfada", latitude: 37.8607, longitude: 23.7533, address: "Gounari 42" },
  { deviceId: "sck-nea-smyrni", name: "Skroutz Nea Smyrni", latitude: 37.9441, longitude: 23.7135, address: "Omirou 8" },
  { deviceId: "sck-piraeus", name: "Skroutz Piraeus", latitude: 37.9475, longitude: 23.6432, address: "Iroon Polytechneiou 30" },
  { deviceId: "sck-marousi", name: "Skroutz Marousi", latitude: 38.0505, longitude: 23.8058, address: "Kifisias 120" },
  { deviceId: "sck-chalandri", name: "Skroutz Chalandri", latitude: 38.0214, longitude: 23.7987, address: "Andrianou 5" },
  { deviceId: "sck-peristeri", name: "Skroutz Peristeri", latitude: 38.0139, longitude: 23.6916, address: "Panagi Tsaldari 88" },
  { deviceId: "sck-kallithea", name: "Skroutz Kallithea", latitude: 37.9562, longitude: 23.6985, address: "Davaki 34" },
  { deviceId: "sck-vyronas", name: "Skroutz Vyronas", latitude: 37.9605, longitude: 23.7632, address: "Kyprou 22" },
  { deviceId: "sck-zografou", name: "Skroutz Zografou", latitude: 37.9735, longitude: 23.7712, address: "Papagou 91" },
  { deviceId: "sck-kolonaki", name: "Skroutz Kolonaki", latitude: 37.9792, longitude: 23.7415, address: "Voukourestiou 18" },
  { deviceId: "sck-syntagma", name: "Skroutz Syntagma", latitude: 37.9755, longitude: 23.7348, address: "Ermou 40" },
];

function assertInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0) throw new Error(`Invalid ${name}: ${v}`);
}

/** Upsert the named Athens sensors, then synthetic ones up to `total`. */
export async function seedSensors(prisma: PrismaClient, total: number): Promise<number> {
  for (const s of ATHENS_SENSORS) {
    await prisma.sensor.upsert({
      where: { deviceId: s.deviceId },
      update: { name: s.name, latitude: s.latitude, longitude: s.longitude, address: s.address },
      create: s,
    });
  }
  for (let n = ATHENS_SENSORS.length + 1; n <= total; n++) {
    const deviceId = `sck-sim-${String(n).padStart(3, "0")}`;
    await prisma.sensor.upsert({
      where: { deviceId },
      update: {},
      create: {
        deviceId,
        name: `Sim Sensor ${n}`,
        latitude: 37.95 + Math.random() * 0.15,
        longitude: 23.65 + Math.random() * 0.2,
      },
    });
  }
  return prisma.sensor.count();
}

/**
 * Bulk-insert synthetic readings for every sensor, one row per `step` seconds
 * from `now()-hours` to `now()-until`, via a single generate_series INSERT.
 * Returns the number of rows inserted.
 */
export async function backfillRange(
  prisma: PrismaClient,
  hours: number,
  step: number,
  until: number
): Promise<number> {
  assertInt("hours", hours);
  assertInt("step", step);
  assertInt("until", until);
  if (hours <= until) throw new Error(`hours (${hours}) must be > until (${until})`);
  if (step < 1) throw new Error("step must be >= 1");

  // All interval values are validated non-negative integers — safe to interpolate.
  return prisma.$executeRawUnsafe(`
    INSERT INTO readings (sensor_id, recorded_at, noise_dba, temperature, humidity)
    SELECT s.id,
           g.ts,
           45 + 35 * random(),
           15 + 15 * random(),
           40 + 30 * random()
    FROM sensors s
    CROSS JOIN generate_series(
      now() - interval '${hours} hours',
      now() - interval '${until} hours',
      interval '${step} seconds'
    ) AS g(ts)
    ON CONFLICT (sensor_id, recorded_at) DO NOTHING
  `);
}

/** Materialize the continuous aggregates over the given lookback windows. */
export async function refreshRollups(
  prisma: PrismaClient,
  minuteDays: number,
  hourDays: number
): Promise<void> {
  assertInt("minuteDays", minuteDays);
  assertInt("hourDays", hourDays);
  await prisma.$executeRawUnsafe(
    `CALL refresh_continuous_aggregate('readings_1m', now() - interval '${minuteDays} days', now())`
  );
  await prisma.$executeRawUnsafe(
    `CALL refresh_continuous_aggregate('readings_1h', now() - interval '${hourDays} days', now())`
  );
}

/** Drop raw chunks older than 24h (what the retention policy does, but now). */
export async function trimRawTo24h(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRawUnsafe(`SELECT drop_chunks('readings', older_than => INTERVAL '24 hours')`);
}

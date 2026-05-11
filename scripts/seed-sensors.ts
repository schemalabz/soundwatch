import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ATHENS_SENSORS = [
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

async function main() {
  console.log(`Seeding ${ATHENS_SENSORS.length} sensors...`);

  for (const sensor of ATHENS_SENSORS) {
    await prisma.sensor.upsert({
      where: { deviceId: sensor.deviceId },
      update: {
        name: sensor.name,
        latitude: sensor.latitude,
        longitude: sensor.longitude,
        address: sensor.address,
      },
      create: sensor,
    });
    console.log(`  ✓ ${sensor.name} (${sensor.deviceId})`);
  }

  console.log("\nDone!");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

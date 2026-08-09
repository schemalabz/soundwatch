// The simulated 50-sensor fleet, spread across real Athens neighborhoods.
// Every deviceId is sim-{area} — clearly synthetic, never colliding with
// real fleet tokens (which are minted 16-char strings). Coordinates are
// approximate neighborhood centers — good enough for a map, deliberately
// not real installation addresses.
//
// Every value here is a literal: the fleet must be identical across runs and
// across processes (backfill vs live) or the data would tear at the seams.

import { hashStr } from "./random";

// Archetype drives the diurnal/weekly shape in model.ts:
//   nightlife   — bars/entertainment: loud late evenings, louder Fri/Sat
//   commercial  — shops/offices: midday + early-evening peaks, quiet Sundays
//   arterial    — big roads: morning + evening rush peaks
//   residential — quiet nights, mild daytime plateau
export type Archetype = "nightlife" | "commercial" | "arterial" | "residential";

export interface FleetSensor {
  deviceId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  archetype: Archetype;
  /** Long-term average level in device-dB (the model's anchor). */
  baseDb: number;
  /** Typical min-to-max swing in dB (legacy NOISE_PROFILES span). */
  baseSpanDb: number;
}

export const FLEET: FleetSensor[] = [
  // nightlife (8)
  { deviceId: "sim-exarchia", name: "Sim Exarchia", latitude: 37.9868, longitude: 23.7342, address: "Stournari 28", archetype: "nightlife", baseDb: 72, baseSpanDb: 20 },
  { deviceId: "sim-monastiraki", name: "Sim Monastiraki", latitude: 37.9762, longitude: 23.7254, address: "Ifestou 12", archetype: "nightlife", baseDb: 75, baseSpanDb: 20 },
  { deviceId: "sim-glyfada", name: "Sim Glyfada", latitude: 37.8607, longitude: 23.7533, address: "Gounari 42", archetype: "nightlife", baseDb: 53.5, baseSpanDb: 17 },
  { deviceId: "sim-gazi", name: "Sim Gazi", latitude: 37.9785, longitude: 23.7115, address: "Persefonis 19", archetype: "nightlife", baseDb: 70, baseSpanDb: 22 },
  { deviceId: "sim-psyri", name: "Sim Psyri", latitude: 37.9789, longitude: 23.7238, address: "Miaouli 11", archetype: "nightlife", baseDb: 68, baseSpanDb: 21 },
  { deviceId: "sim-koukaki", name: "Sim Koukaki", latitude: 37.9631, longitude: 23.7259, address: "Georgaki Olympiou 7", archetype: "nightlife", baseDb: 63, baseSpanDb: 19 },
  { deviceId: "sim-thiseio", name: "Sim Thiseio", latitude: 37.9769, longitude: 23.7195, address: "Irakleidon 5", archetype: "nightlife", baseDb: 64, baseSpanDb: 19 },
  { deviceId: "sim-metaxourgeio", name: "Sim Metaxourgeio", latitude: 37.9862, longitude: 23.7205, address: "Megalou Alexandrou 80", archetype: "nightlife", baseDb: 66, baseSpanDb: 20 },
  // commercial (13)
  { deviceId: "sim-syntagma", name: "Sim Syntagma", latitude: 37.9755, longitude: 23.7348, address: "Ermou 40", archetype: "commercial", baseDb: 69, baseSpanDb: 18 },
  { deviceId: "sim-kolonaki", name: "Sim Kolonaki", latitude: 37.9792, longitude: 23.7415, address: "Voukourestiou 18", archetype: "commercial", baseDb: 63.5, baseSpanDb: 17 },
  { deviceId: "sim-marousi", name: "Sim Marousi", latitude: 38.0505, longitude: 23.8058, address: "Kifisias 120", archetype: "commercial", baseDb: 59, baseSpanDb: 18 },
  { deviceId: "sim-kifisia", name: "Sim Kifisia", latitude: 38.0745, longitude: 23.8103, address: "Kolokotroni 15", archetype: "commercial", baseDb: 50, baseSpanDb: 16 },
  { deviceId: "sim-ampelokipoi", name: "Sim Ampelokipoi", latitude: 37.9877, longitude: 23.7572, address: "Panormou 44", archetype: "commercial", baseDb: 61, baseSpanDb: 18 },
  { deviceId: "sim-cholargos", name: "Sim Cholargos", latitude: 38.0037, longitude: 23.794, address: "Mesogeion 235", archetype: "commercial", baseDb: 58, baseSpanDb: 17 },
  { deviceId: "sim-agia-paraskevi", name: "Sim Agia Paraskevi", latitude: 37.995, longitude: 23.818, address: "Agiou Ioannou 12", archetype: "commercial", baseDb: 56, baseSpanDb: 16 },
  { deviceId: "sim-nea-ionia", name: "Sim Nea Ionia", latitude: 38.041, longitude: 23.757, address: "Irakleiou 315", archetype: "commercial", baseDb: 57, baseSpanDb: 17 },
  { deviceId: "sim-palaio-faliro", name: "Sim Palaio Faliro", latitude: 37.9285, longitude: 23.702, address: "Amfitheas 60", archetype: "commercial", baseDb: 58, baseSpanDb: 17 },
  { deviceId: "sim-alimos", name: "Sim Alimos", latitude: 37.9105, longitude: 23.7268, address: "Kalamakiou 38", archetype: "commercial", baseDb: 56, baseSpanDb: 16 },
  { deviceId: "sim-pefki", name: "Sim Pefki", latitude: 38.063, longitude: 23.792, address: "Eirinis 25", archetype: "commercial", baseDb: 54, baseSpanDb: 16 },
  { deviceId: "sim-vrilissia", name: "Sim Vrilissia", latitude: 38.034, longitude: 23.83, address: "Leoforos Pentelis 45", archetype: "commercial", baseDb: 55, baseSpanDb: 16 },
  { deviceId: "sim-nea-erythraia", name: "Sim Nea Erythraia", latitude: 38.092, longitude: 23.817, address: "Charilaou Trikoupi 148", archetype: "commercial", baseDb: 54, baseSpanDb: 16 },
  // arterial (11)
  { deviceId: "sim-piraeus", name: "Sim Piraeus", latitude: 37.9475, longitude: 23.6432, address: "Iroon Polytechneiou 30", archetype: "arterial", baseDb: 68, baseSpanDb: 20 },
  { deviceId: "sim-peristeri", name: "Sim Peristeri", latitude: 38.0139, longitude: 23.6916, address: "Panagi Tsaldari 88", archetype: "arterial", baseDb: 63.5, baseSpanDb: 17 },
  { deviceId: "sim-kallithea", name: "Sim Kallithea", latitude: 37.9562, longitude: 23.6985, address: "Davaki 34", archetype: "arterial", baseDb: 61, baseSpanDb: 18 },
  { deviceId: "sim-patisia", name: "Sim Patisia", latitude: 38.008, longitude: 23.731, address: "Patision 240", archetype: "arterial", baseDb: 66, baseSpanDb: 19 },
  { deviceId: "sim-sepolia", name: "Sim Sepolia", latitude: 38.002, longitude: 23.713, address: "Liosion 190", archetype: "arterial", baseDb: 64, baseSpanDb: 19 },
  { deviceId: "sim-moschato", name: "Sim Moschato", latitude: 37.955, longitude: 23.68, address: "Piraios 74", archetype: "arterial", baseDb: 65, baseSpanDb: 19 },
  { deviceId: "sim-tavros", name: "Sim Tavros", latitude: 37.964, longitude: 23.691, address: "Chamosternas 22", archetype: "arterial", baseDb: 63, baseSpanDb: 18 },
  { deviceId: "sim-egaleo", name: "Sim Egaleo", latitude: 37.991, longitude: 23.682, address: "Iera Odos 296", archetype: "arterial", baseDb: 64, baseSpanDb: 19 },
  { deviceId: "sim-ilion", name: "Sim Ilion", latitude: 38.033, longitude: 23.7, address: "Thivon 380", archetype: "arterial", baseDb: 62, baseSpanDb: 18 },
  { deviceId: "sim-dafni", name: "Sim Dafni", latitude: 37.949, longitude: 23.737, address: "Vouliagmenis 250", archetype: "arterial", baseDb: 65, baseSpanDb: 19 },
  { deviceId: "sim-neos-kosmos", name: "Sim Neos Kosmos", latitude: 37.957, longitude: 23.728, address: "Syngrou 136", archetype: "arterial", baseDb: 66, baseSpanDb: 19 },
  // residential (18)
  { deviceId: "sim-pagkrati", name: "Sim Pagkrati", latitude: 37.9685, longitude: 23.7492, address: "Ymittou 56", archetype: "residential", baseDb: 59, baseSpanDb: 18 },
  { deviceId: "sim-nea-smyrni", name: "Sim Nea Smyrni", latitude: 37.9441, longitude: 23.7135, address: "Omirou 8", archetype: "residential", baseDb: 56.5, baseSpanDb: 17 },
  { deviceId: "sim-chalandri", name: "Sim Chalandri", latitude: 38.0214, longitude: 23.7987, address: "Andrianou 5", archetype: "residential", baseDb: 56, baseSpanDb: 16 },
  { deviceId: "sim-vyronas", name: "Sim Vyronas", latitude: 37.9605, longitude: 23.7632, address: "Kyprou 22", archetype: "residential", baseDb: 56.5, baseSpanDb: 17 },
  { deviceId: "sim-zografou", name: "Sim Zografou", latitude: 37.9735, longitude: 23.7712, address: "Papagou 91", archetype: "residential", baseDb: 54.5, baseSpanDb: 17 },
  { deviceId: "sim-petralona", name: "Sim Petralona", latitude: 37.968, longitude: 23.709, address: "Troon 49", archetype: "residential", baseDb: 52, baseSpanDb: 16 },
  { deviceId: "sim-ilisia", name: "Sim Ilisia", latitude: 37.974, longitude: 23.755, address: "Papadiamantopoulou 30", archetype: "residential", baseDb: 53, baseSpanDb: 16 },
  { deviceId: "sim-galatsi", name: "Sim Galatsi", latitude: 38.013, longitude: 23.749, address: "Veikou 82", archetype: "residential", baseDb: 51, baseSpanDb: 15 },
  { deviceId: "sim-kypseli", name: "Sim Kypseli", latitude: 38.0, longitude: 23.74, address: "Fokionos Negri 30", archetype: "residential", baseDb: 55, baseSpanDb: 17 },
  { deviceId: "sim-ilioupoli", name: "Sim Ilioupoli", latitude: 37.931, longitude: 23.758, address: "Marinou Antypa 64", archetype: "residential", baseDb: 50, baseSpanDb: 15 },
  { deviceId: "sim-argyroupoli", name: "Sim Argyroupoli", latitude: 37.903, longitude: 23.752, address: "Kyprou 76", archetype: "residential", baseDb: 49, baseSpanDb: 15 },
  { deviceId: "sim-chaidari", name: "Sim Chaidari", latitude: 38.011, longitude: 23.666, address: "Favierou 30", archetype: "residential", baseDb: 50, baseSpanDb: 15 },
  { deviceId: "sim-petroupoli", name: "Sim Petroupoli", latitude: 38.041, longitude: 23.685, address: "25is Martiou 100", archetype: "residential", baseDb: 49, baseSpanDb: 15 },
  { deviceId: "sim-irakleio", name: "Sim Irakleio", latitude: 38.051, longitude: 23.766, address: "Marinou Antypa 12", archetype: "residential", baseDb: 50, baseSpanDb: 15 },
  { deviceId: "sim-melissia", name: "Sim Melissia", latitude: 38.05, longitude: 23.833, address: "Dimokratias 20", archetype: "residential", baseDb: 46, baseSpanDb: 14 },
  { deviceId: "sim-voula", name: "Sim Voula", latitude: 37.846, longitude: 23.777, address: "Vasileos Pavlou 18", archetype: "residential", baseDb: 47, baseSpanDb: 14 },
  { deviceId: "sim-elliniko", name: "Sim Elliniko", latitude: 37.889, longitude: 23.744, address: "Iasonidou 45", archetype: "residential", baseDb: 48, baseSpanDb: 14 },
  { deviceId: "sim-nea-filadelfeia", name: "Sim Nea Filadelfeia", latitude: 38.035, longitude: 23.738, address: "Dekelias 96", archetype: "residential", baseDb: 51, baseSpanDb: 15 },
];

/**
 * Per-sensor publish phase within an interval, so 50 sensors never fire on
 * the same second (mirrors real devices whose clocks are not aligned).
 */
export function phaseOffsetS(deviceId: string, intervalS: number): number {
  return hashStr(deviceId) % Math.max(1, Math.floor(intervalS));
}

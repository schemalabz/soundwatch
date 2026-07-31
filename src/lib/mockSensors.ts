// Mock sensor list for the redesign: 50 Athens sensors with coordinates + a
// current value per map layer, derived from our generated data
// (scripts/soundbands/generate_sensor_geo.py -> sensorsGeo.json).
// Shape matches what /api/sensors returns, so MapSection/SensorMap/SensorPanel
// consume it unchanged.
import geo from "./sensorsGeo.json";

const STAMP = "2026-07-27T08:00:00Z"; // fixed so SSR and client hydration match
const OFFLINE_STAMP = "2026-02-18T08:00:00Z"; // ~5 months earlier, for offline units

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// Dominant detected sound class per sensor (from the masking classifier).
const SOUND_CLASSES = ["siren", "dog_bark", "engine_idling", "constructions"] as const;

export function getMockSensors() {
  return geo.sensors.map((s, i) => {
    const uv = s.uvIndex;
    const isActive = i % 5 !== 0; // ~1 in 5 sensors offline, deterministic
    const seenAt = isActive ? STAMP : OFFLINE_STAMP;
    const noiseClass = SOUND_CLASSES[(i * 3 + Math.round(s.noiseDba)) % SOUND_CLASSES.length];
    return {
      id: s.id,
      deviceId: s.id,
      name: s.name,
      latitude: s.lat,
      longitude: s.lng,
      address: `${s.name}, Αθήνα`,
      isActive,
      lastSeenAt: seenAt,
      latestReading: {
        recordedAt: seenAt,
        noiseDba: s.noiseDba,
        noisePeak: s.noisePeak,   // historical high
        noiseSpread: s.spread,    // 0..1 normalized peak -> heatmap spread
        noiseClass,               // dominant detected sound class
        pm1: r(s.pm25 * 0.9), pm25: s.pm25, pm4: r(s.pm25 * 1.02), pm10: r(s.pm25 * 1.06),
        uvIndex: uv, uvA: r(uv * 0.5, 3), uvB: r(uv * 0.2, 3), uvC: r(uv * 0.3, 3),
      },
    };
  });
}

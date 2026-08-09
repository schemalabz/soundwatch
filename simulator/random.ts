// Deterministic randomness primitives shared by the whole simulator. There
// is no Math.random anywhere: every value derives from integer hashes of
// (deviceId, salt, index), so any process — backfill, live streamer, tests —
// computes the identical fleet history. SIM_SEED reseeds everything at once.

/** Cheap deterministic 32-bit string hash (FNV-1a). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const GLOBAL_SEED = hashStr(process.env.SIM_SEED ?? "soundwatch");

/** splitmix32-style avalanche of a 32-bit int to [0,1). */
function mix01(x: number): number {
  let z = (x + 0x9e3779b9) >>> 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return (z >>> 0) / 4294967296;
}

/** Deterministic uniform [0,1) from (deviceId, salt, integer index). */
export function rand01(deviceId: string, salt: string, index: number): number {
  return mix01((hashStr(deviceId) ^ hashStr(salt) ^ Math.imul(index | 0, 0x9e3779b1) ^ GLOBAL_SEED) >>> 0);
}

/**
 * 1D value noise: smoothstep interpolation between hash values at lattice
 * points floor(t/periodS). Continuous in t, so consecutive readings wander
 * instead of jumping. Returns [-1, 1].
 */
export function valueNoise(deviceId: string, salt: string, tSec: number, periodS: number): number {
  const x = tSec / periodS;
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f); // smoothstep
  const a = rand01(deviceId, salt, i);
  const b = rand01(deviceId, salt, i + 1);
  return (a + (b - a) * s) * 2 - 1;
}

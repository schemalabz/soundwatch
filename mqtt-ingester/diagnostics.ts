// Device health telemetry — packed id 243, emitted by the fleet-survivability
// firmware as "uptime_s-freeheap-rcause-wificonnects-pubfails-capfails" and,
// from the Approach-A build on, with a 7th field: "-i2sreinits" (cumulative
// mid-interval I2S recoveries). Decoding is index-based, so older payloads
// simply leave newer fields null.
//
// This is the ONLY window into a deployed unit: there is no site access and no
// SAM-side OTA. If the backend drops this, the fleet is unobservable — you
// cannot tell a rebooting unit from a healthy one, or spot a heap leak before
// it wedges. The firmware work to emit it is inert unless we store it.

export interface Diagnostics {
  deviceUptimeS: number | null; // seconds since boot — resets to ~0 on reboot
  freeHeapBytes: number | null; // SAMD21 free RAM; ~2.9KB baseline, ~8KB after the Step A reclaim
  resetCause: number | null; // SAMD21 RCAUSE register (see note below)
  wifiConnects: number | null; // cumulative WiFi associations — a climbing count means churn
  publishFails: number | null; // cumulative failed publishes
  captureFails: number | null; // cumulative dropped audio frames (I2S could not deliver in time)
  i2sReinits: number | null; // cumulative mid-interval I2S recoveries (Approach A; null pre-A firmware)
  ghostRefusals: number | null; // blanking ESP config syncs refused (config-ghost tripwire; null pre-guard)
  // Release 1.0 build stamp. Before it, the only record of which firmware a
  // unit ran was a table in a handoff doc — and the fleet drifted to five
  // builds across eight units with no way to check from the data.
  soundwatchRelease: string | null; // e.g. "1.0"; null pre-1.0 firmware
  // Short git hashes of each chip's image. The SAM learns the ESP's over the
  // config sync, so one unit reports both. A trailing "+" means that image was
  // built from a modified tree and does NOT reproduce from the commit it names.
  samGitHash: string | null;
  espGitHash: string | null; // null while the ESP has not synced (wire sends "na")
}

const EMPTY: Diagnostics = {
  deviceUptimeS: null,
  freeHeapBytes: null,
  resetCause: null,
  wifiConnects: null,
  publishFails: null,
  captureFails: null,
  i2sReinits: null,
  ghostRefusals: null,
  soundwatchRelease: null,
  samGitHash: null,
  espGitHash: null,
};

/**
 * Decode the packed diagnostics string. Returns null when absent (older
 * firmware simply omits id 243), and leaves individual fields null when a
 * segment is missing or non-numeric rather than failing the whole reading —
 * health telemetry must never be able to reject a measurement.
 *
 * On resetCause: 32 = watchdog fired. 64 = "SYST", which on this board covers
 * BOTH a software reset and a power cycle, because the UF2 bootloader issues a
 * system reset before jumping to the app. So 64 cannot distinguish "it lost
 * power" from "it reset itself" — do not report it as if it can.
 */
export function decodeDiagnostics(raw: string | null | undefined): Diagnostics | null {
  if (!raw) return null;

  const parts = raw.split("-");
  if (parts.length === 0) return null;

  const num = (i: number): number | null => {
    const v = parts[i];
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Fields 9-11 are strings, not counters. "na" is the SAM's placeholder for an
  // ESP that has not synced its version yet — it keeps the payload's shape, but
  // the database should hold null rather than the sentinel.
  const str = (i: number): string | null => {
    const v = parts[i];
    if (v === undefined || v === "" || v === "na") return null;
    return v;
  };

  const out: Diagnostics = {
    ...EMPTY,
    deviceUptimeS: num(0),
    freeHeapBytes: num(1),
    resetCause: num(2),
    wifiConnects: num(3),
    publishFails: num(4),
    captureFails: num(5),
    i2sReinits: num(6),
    ghostRefusals: num(7),
    soundwatchRelease: str(8),
    samGitHash: str(9),
    espGitHash: str(10),
  };

  // All-null means the field carried nothing usable; treat as absent.
  const anyValue = Object.values(out).some((v) => v !== null);
  return anyValue ? out : null;
}

/** True when the last reset was the watchdog rather than a normal boot. */
export function wasWatchdogReset(d: Diagnostics | null): boolean {
  return d?.resetCause === 32;
}

/**
 * True when the two chips were built from different commits.
 *
 * This is the bug release 1.0 exists to close: the fleet ran a SAM built from
 * one branch and an ESP from another, and nothing on the wire could reveal it.
 * Unknowable is deliberately NOT mismatched — pre-1.0 firmware and an ESP that
 * has not synced yet both leave a hash null, and neither is evidence of a split.
 */
export function firmwarePairMismatched(d: Diagnostics | null): boolean {
  if (!d?.samGitHash || !d?.espGitHash) return false;
  return d.samGitHash !== d.espGitHash;
}

/**
 * True when either image was built from a modified working tree, which means it
 * does not reproduce from the commit it names. The marker is a trailing "+",
 * added by build-stamp.sh in the firmware repo.
 */
export function builtFromDirtyTree(d: Diagnostics | null): boolean {
  return Boolean(d?.samGitHash?.endsWith("+") || d?.espGitHash?.endsWith("+"));
}

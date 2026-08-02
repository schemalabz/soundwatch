// Device health telemetry — packed id 243, emitted by the fleet-survivability
// firmware as "uptime_s-freeheap-rcause-wificonnects-pubfails-capfails".
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
}

const EMPTY: Diagnostics = {
  deviceUptimeS: null,
  freeHeapBytes: null,
  resetCause: null,
  wifiConnects: null,
  publishFails: null,
  captureFails: null,
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

  const out: Diagnostics = {
    ...EMPTY,
    deviceUptimeS: num(0),
    freeHeapBytes: num(1),
    resetCause: num(2),
    wifiConnects: num(3),
    publishFails: num(4),
    captureFails: num(5),
  };

  // All-null means the field carried nothing usable; treat as absent.
  const anyValue = Object.values(out).some((v) => v !== null);
  return anyValue ? out : null;
}

/** True when the last reset was the watchdog rather than a normal boot. */
export function wasWatchdogReset(d: Diagnostics | null): boolean {
  return d?.resetCause === 32;
}

import type { ReadingRow } from "./readings";

// A realistic post-fix (payloadVersion 4) row; the histogram is the real
// clamped bench3 interval from 2026-08-12.
export function readingRow(overrides: Partial<ReadingRow> = {}): ReadingRow {
  return {
    recordedAt: new Date("2026-08-12T10:00:00Z"),
    receivedAt: new Date("2026-08-12T10:00:05Z"),
    noiseDba: null,
    laeq: 86.99,
    l10: 88.09,
    l50: 52.3,
    l90: 48.7,
    lmaxEst: 106.2,
    lminEst: 40.2,
    histRaw:
      "0-0-0-0-0-0-0-0-1-23-111-101-62-31-23-15-12-10-14-9-15-11-6-12-10-9-7-14-7-59",
    bandsDb: [
      55.1, 48.2, 47.9, 50.3, 62.0, 58.4, 52.1, 49.9, 47.2, 45.8, 44.1, 43.0,
      42.5, 41.9, 41.2, 40.8, 40.1, 39.7, 69.2, 72.4, 74.0,
    ],
    realizedDuty: 0.31,
    frameCount: 689,
    intervalMs: 27200,
    intervalS: null,
    payloadVersion: 4,
    energySaturations: 0,
    temperature: 28.4,
    humidity: 41,
    lightLux: 120,
    pressurePa: 101300,
    uvA: null,
    uvB: null,
    uvC: null,
    pm1: null,
    pm25: null,
    pm4: null,
    pm10: null,
    pn05: null,
    pn10: null,
    pn25: null,
    pn40: null,
    pn100: null,
    tps: null,
    battery: null,
    rssi: -61,
    sdCard: 1,
    ...overrides,
  };
}

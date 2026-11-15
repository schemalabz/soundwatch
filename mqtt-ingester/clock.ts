// Per-sensor clock estimator state for the live ingester. The estimate itself
// is pure and lives in src/lib/fleet/clockOffset.ts (shared with the backfill);
// this file only keeps one state per sensor and seeds it from the database on
// first sight, so an ingester restart does not start every sensor blind.

import type { PrismaClient } from "@prisma/client";

import {
  CLOCK_CARRY_MS,
  CLOCK_WINDOW_MS,
  correctClock,
  emptyClockState,
  type ClockCorrection,
  type ClockInput,
  type ClockState,
} from "../src/lib/fleet/clockOffset";

interface SeedRow {
  recorded_at: Date;
  received_at: Date;
  corrected_at: Date | null;
}

export class ClockTracker {
  private states = new Map<string, Promise<ClockState>>();

  constructor(private prisma: PrismaClient) {}

  async correct(sensorId: string, row: ClockInput): Promise<ClockCorrection> {
    let state = this.states.get(sensorId);
    if (!state) {
      state = this.seed(sensorId, row.receivedAt).catch((err) => {
        console.error(`clock seed failed for ${sensorId}, starting empty:`, err);
        return emptyClockState();
      });
      this.states.set(sensorId, state);
    }
    return correctClock(await state, row);
  }

  /** Replay the last window of arrivals through the estimator, plus the last estimate for the carry. */
  private async seed(sensorId: string, now: Date): Promise<ClockState> {
    const state = emptyClockState();
    const last = await this.prisma.$queryRaw<SeedRow[]>`
      SELECT recorded_at, received_at, corrected_at FROM readings
      WHERE sensor_id = ${sensorId}
        AND corrected_at IS NOT NULL
        AND received_at > ${new Date(now.getTime() - CLOCK_CARRY_MS)}
        AND received_at < ${now}
      ORDER BY received_at DESC LIMIT 1`;
    if (last[0]) {
      state.last = {
        offsetMs: last[0].recorded_at.getTime() - last[0].corrected_at!.getTime(),
        receivedMs: last[0].received_at.getTime(),
      };
    }
    const recent = await this.prisma.$queryRaw<SeedRow[]>`
      SELECT recorded_at, received_at, corrected_at FROM readings
      WHERE sensor_id = ${sensorId}
        AND received_at > ${new Date(now.getTime() - CLOCK_WINDOW_MS)}
        AND received_at < ${now}
      ORDER BY received_at`;
    for (const r of recent) {
      correctClock(state, { recordedAt: r.recorded_at, receivedAt: r.received_at });
    }
    return state;
  }
}

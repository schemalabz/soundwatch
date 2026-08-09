// Frame buffering for map playback. A "frame" is the per-sensor state at one
// playhead instant (trailing energy-averaged window). The store is a plain
// class held in a ref — deliberately OUTSIDE React state: frames arrive and
// expire constantly, and only "the frame I'm looking at just became
// available" should ever cause a render.

import { advanceCursor, type TimeSegment } from "./filters";

export interface SensorFrameValue {
  laeq: number;
  n: number;
}
export type FrameData = Record<string, SensorFrameValue>;

/** Trailing aggregation window for a given playback step. */
export function frameWindowS(stepMs: number): number {
  return Math.max(300, Math.round(stepMs / 1000));
}

/** Frames are keyed on minute-quantized time so playback, scrubbing and
 *  prefetch all address the same entry. */
export function quantizeFrameMs(tMs: number): number {
  return Math.floor(tMs / 60_000) * 60_000;
}
export function frameKey(tMs: number, windowS: number, metric: string): string {
  return `${quantizeFrameMs(tMs)}:${windowS}:${metric}`;
}

/**
 * The playhead's upcoming frame instants (including the current one),
 * walking the same gap-skipping advance the playback clock uses — so what
 * we prefetch is exactly what will be shown.
 */
export function upcomingFrameTimes(
  segments: TimeSegment[],
  cursorMs: number,
  stepMs: number,
  count: number
): number[] {
  const out: number[] = [cursorMs];
  let t = cursorMs;
  for (let i = 1; i < count; i++) {
    const next = advanceCursor(segments, t, stepMs);
    if (next == null) break;
    out.push(next);
    t = next;
  }
  return out;
}

const MAX_RESOLVED_FRAMES = 48;

export class FrameStore {
  private entries = new Map<string, FrameData | "pending">();

  get(key: string): FrameData | undefined {
    const v = this.entries.get(key);
    return v === "pending" ? undefined : v;
  }

  /** True when the key is resolved OR already being fetched. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  markPending(key: string): void {
    if (!this.entries.has(key)) this.entries.set(key, "pending");
  }

  /** A failed fetch must clear its pending markers or they'd block retries. */
  clearPending(key: string): void {
    if (this.entries.get(key) === "pending") this.entries.delete(key);
  }

  set(key: string, data: FrameData): void {
    this.entries.delete(key); // re-insert at the end (freshest position)
    this.entries.set(key, data);
    this.evict();
  }

  /** Drop oldest resolved frames beyond the cap (pendings are never evicted:
   *  their fetch is already paid for and about to land). */
  private evict(): void {
    let resolved = 0;
    for (const v of this.entries.values()) if (v !== "pending") resolved++;
    if (resolved <= MAX_RESOLVED_FRAMES) return;
    for (const [k, v] of this.entries) {
      if (v === "pending") continue;
      this.entries.delete(k);
      resolved--;
      if (resolved <= MAX_RESOLVED_FRAMES) break;
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

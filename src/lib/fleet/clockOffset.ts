// Device clock correction (issue #12).
//
// Every reading carries recorded_at (the device's RTC) and received_at (the
// server, at insert). Neither is "when the sound happened":
//
//   - recorded_at is off by the clock error: RTCs run up to ~25 min fast or
//     slow between NTP syncs, and snap back when the unit reboots.
//   - received_at is off by the transport delay: seconds for a live row, hours
//     or days for a row replayed from flash after an outage.
//
// For a row that arrived promptly the delay is ~0, so
//
//     d = recorded_at - received_at
//
// IS the clock error at that moment. A replayed row has the same clock error
// minus the time it sat in flash, so its d is strictly lower. That gives a
// robust estimate: the MAX of d over the recent prompt rows. Replays can only
// pull d down, so they never move the max; the live rows set it.
//
// Two cases need care:
//
//   - A resync (NTP, or the reboot that brings one) drops d at once. A replay
//     drops it too, but only a resync keeps it there: the new value is
//     believed once CLOCK_CONFIRM_ROWS consecutive rows agree on it.
//   - A backlog's last minutes are only a few minutes late, so their d passes
//     the cap. They arrive as a burst (rows < 5 s apart), and burst rows never
//     feed the estimate.
//
// The estimate is then applied to every row, replays included:
//
//     corrected_at = recorded_at - offset
//
// A replay gets the clock error measured from the rows around it rather than
// its own d, which is the best available guess: a single replayed row cannot
// tell clock error from time in flash (both push d the same way).
//
// Pure and synchronous on purpose: the ingester (live, row by row) and the
// one-off backfill (scripts/backfill-corrected-at.ts) run the same code.
// The ingester image ships src/lib/fleet, so this file must not import from
// outside it.

/**
 * The largest clock error we believe. Same 35 minutes as /api/frames: the
 * fleet drifts up to ~25 min a day, plus margin. A row whose d is beyond this
 * is not prompt — it is a replay (or a clock that lost its time entirely) —
 * and contributes nothing to the estimate.
 *
 * This also bounds every correction: |recorded_at - corrected_at| <= CAP, so a
 * query on corrected time can still prune chunks on recorded_at ± CAP, and
 * the hour shift is always -1, 0 or +1.
 */
export const CLOCK_DRIFT_CAP_MS = 35 * 60_000;

/**
 * How far back (by arrival) prompt rows feed the max. Live cadence is 30–60 s,
 * so 30–60 rows: enough to find the least-delayed one, short enough that a
 * clock drifting slower (d falling ~20 s/h) is followed within ~10 s.
 */
export const CLOCK_WINDOW_MS = 30 * 60_000;

/**
 * Rows arriving closer together than this are a burst: a backlog flushed on
 * reconnect, or the broker draining its queue after an ingester restart. Live
 * rows are 30 s apart at the fastest, so a burst row is never live and never
 * feeds the estimate — even when it is only a few minutes late and its d
 * would pass the cap.
 */
export const CLOCK_BURST_GAP_MS = 5_000;

/**
 * How long the last estimate stands in when no prompt row is in the window —
 * typically a backlog flushed on reconnect before the first live row. Beyond
 * one daily restart cycle the clock has been resynced and the old error says
 * nothing, so the row is left uncorrected.
 */
export const CLOCK_CARRY_MS = 24 * 3600_000;

/**
 * A drop in d bigger than this is either a replay or the clock being resynced
 * (NTP, or a reboot). A resync is believed once CLOCK_CONFIRM_ROWS rows in a
 * row, at live cadence, agree on the new value; a replay never does that.
 */
const CLOCK_DROP_MS = 60_000;
const CLOCK_CONFIRM_ROWS = 3;

const HOUR_MS = 3600_000;

interface Sample {
  receivedMs: number;
  offsetMs: number;
}

/** Per-sensor estimator state. Treat as opaque; start from emptyClockState(). */
export interface ClockState {
  /** Prompt rows inside the window, any order. */
  samples: Sample[];
  /** Consecutive prompt rows whose d fell below the estimate, oldest first: a resync until proven otherwise. */
  pending: Sample[];
  /** The last estimate made, for rows that arrive with an empty window. */
  last: { offsetMs: number; receivedMs: number } | null;
  /** Arrival of the previous row, prompt or not, for burst detection. */
  lastArrivalMs: number | null;
}

export function emptyClockState(): ClockState {
  return { samples: [], pending: [], last: null, lastArrivalMs: null };
}

export interface ClockInput {
  recordedAt: Date;
  receivedAt: Date;
}

export interface ClockCorrection {
  /** Estimated device clock error (device - server) applied to this row, ms. null = no estimate. */
  offsetMs: number | null;
  /** recorded_at - offset, or null when there is no estimate. */
  correctedAt: Date | null;
  /** Hours between the corrected hour and the device hour: -1, 0 or +1. */
  hourShift: number;
}

/** Whole hours between the hour `correctedMs` falls in and the hour `recordedMs` falls in. */
export function hourShift(recordedMs: number, correctedMs: number): number {
  return Math.floor(correctedMs / HOUR_MS) - Math.floor(recordedMs / HOUR_MS);
}

/**
 * Feed one row (in arrival order) and get its correction. Mutates `state`.
 *
 * Arrival order matters only loosely: the window is keyed on received_at, and
 * the ingester's concurrent inserts reorder rows by milliseconds at most.
 */
export function correctClock(state: ClockState, row: ClockInput): ClockCorrection {
  const recordedMs = row.recordedAt.getTime();
  const receivedMs = row.receivedAt.getTime();
  const d = recordedMs - receivedMs;

  state.samples = state.samples.filter((s) => s.receivedMs > receivedMs - CLOCK_WINDOW_MS);
  const burst = state.lastArrivalMs != null && Math.abs(receivedMs - state.lastArrivalMs) < CLOCK_BURST_GAP_MS;
  state.lastArrivalMs = receivedMs;

  if (!burst && Math.abs(d) <= CLOCK_DRIFT_CAP_MS) {
    const reference = maxOffset(state.samples) ?? carried(state, receivedMs);
    const sample = { receivedMs, offsetMs: d };
    if (reference == null || d >= reference - CLOCK_DROP_MS) {
      // Agrees with the estimate (or raises it: replays only lower d, so a
      // higher d is always the clock). Any pending drop was replays.
      state.samples.push(sample);
      state.pending = [];
    } else {
      // Below the estimate: a replay, or the clock just snapped back. Hold it
      // aside until enough rows agree.
      const first = state.pending[0];
      if (first && Math.abs(d - first.offsetMs) <= CLOCK_DROP_MS) state.pending.push(sample);
      else state.pending = [sample];
      if (state.pending.length >= CLOCK_CONFIRM_ROWS) {
        state.samples = state.pending;
        state.pending = [];
      }
    }
  }

  let offsetMs = maxOffset(state.samples);
  if (offsetMs != null) state.last = { offsetMs, receivedMs };
  else offsetMs = carried(state, receivedMs);

  if (offsetMs == null) return { offsetMs: null, correctedAt: null, hourShift: 0 };
  const correctedMs = recordedMs - offsetMs;
  return { offsetMs, correctedAt: new Date(correctedMs), hourShift: hourShift(recordedMs, correctedMs) };
}

function carried(state: ClockState, receivedMs: number): number | null {
  return state.last && receivedMs - state.last.receivedMs <= CLOCK_CARRY_MS ? state.last.offsetMs : null;
}

function maxOffset(samples: Sample[]): number | null {
  let max: number | null = null;
  for (const s of samples) if (max == null || s.offsetMs > max) max = s.offsetMs;
  return max;
}

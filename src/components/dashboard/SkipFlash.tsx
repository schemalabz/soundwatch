"use client";

// The time-jump hold: when playback skips a filter-excluded gap, the clock
// pauses (see the shell's frame clock) and the map gets a 3-second VHS
// treatment — backdrop blur + scanlines + a rolling tracking band + frame
// jitter — while the sensor circles keep animating toward their landing
// values underneath. The landing date itself is announced by CurrentDate
// (bottom-left), which takes the fast-forward mark during the hold.
//
// (A capture-based VHS shader component can't see mapbox's WebGL canvas in
// today's browsers — html-in-canvas is still experimental — so this is the
// portable rendition; the blur IS the fallback and the default.)

import { useEffect, useState } from "react";

export interface SkipEvent {
  /** Monotonic id so consecutive skips retrigger the animation. */
  seq: number;
  targetMs: number;
}

// The jump is a held beat: playback pauses for this long (see the shell's
// frame clock) while the effect stays up.
export const SKIP_HOLD_MS = 3000;

export default function SkipFlash({ skip }: { skip: SkipEvent | null }) {
  // `active` is DERIVED (skip minus dismissals) — the timer only ever marks
  // the current seq as dismissed, asynchronously.
  const [dismissedSeq, setDismissedSeq] = useState(0);
  const active = skip != null && skip.seq !== dismissedSeq;

  useEffect(() => {
    if (!skip) return;
    const timer = setTimeout(() => setDismissedSeq(skip.seq), SKIP_HOLD_MS);
    return () => clearTimeout(timer);
  }, [skip]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-[5] overflow-hidden transition-opacity duration-300 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* the VHS pass: blur + slight color push over the live map */}
      <div
        className={active ? "sw-vhs-jitter absolute inset-0" : "absolute inset-0"}
        style={{
          backdropFilter: active ? "blur(3.5px) saturate(1.25) contrast(1.06)" : undefined,
          WebkitBackdropFilter: active ? "blur(3.5px) saturate(1.25) contrast(1.06)" : undefined,
        }}
      />
      {/* scanlines */}
      {active && (
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgb(45 49 66) 0px, rgb(45 49 66) 1px, transparent 1px, transparent 3px)",
          }}
        />
      )}
      {/* rolling tracking band */}
      {active && (
        <div
          className="sw-vhs-band absolute inset-x-0 h-[14%]"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgb(255 255 255 / 0.35) 35%, rgb(45 49 66 / 0.06) 55%, transparent)",
          }}
        />
      )}
    </div>
  );
}

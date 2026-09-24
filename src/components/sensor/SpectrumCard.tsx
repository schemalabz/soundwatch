"use client";

// One bar per band for the interval in focus. The scale is derived from the
// window by spectrumScale (see src/lib/sensor/live.ts) so one interval can
// still be compared to the next by eye; SPECTRUM_MIN_DB/MAX_DB there are only
// the no-bands fallback.
//
// The chart stops below 12.5 kHz: the three bands above it are the sensor's
// own noise, not the scene (see SELF_NOISE_FROM_BAND in live.ts for the
// measurement). They stay in the API and the CSV, so the note below says the
// plot is not the whole record.

import type { ApiReading } from "@/lib/api/schemas";
import { fmtDb } from "@/lib/dashboard/format";
import { bandRangeLabel, fmtClock, PLOTTED_BAND_COUNT, spectrumBars, spectrumTicks, type SpectrumScale } from "@/lib/sensor/live";
import { sensorStrings as tr } from "@/lib/strings/sensor";
import HelpLabel from "./HelpLabel";

export default function SpectrumCard({
  reading,
  isLive,
  scale,
  hasAnyBands,
}: {
  reading: ApiReading;
  isLive: boolean;
  scale: SpectrumScale;
  /** Whether any reading in the window carried bands; false means older firmware — no spectrum at all. */
  hasAnyBands: boolean;
}) {
  if (!hasAnyBands) return null;
  const bars = spectrumBars(reading.bandsDb, scale);
  const ticks = spectrumTicks(scale);
  const pct = (v: number) => ((v - scale.min) / (scale.max - scale.min)) * 100;
  const n = bars.length;

  // Single description for the whole plot; the bars, gridlines and ticks
  // are decorative once this exists, so they're aria-hidden and this is what
  // assistive tech actually reads.
  const plotLabel =
    n > 0
      ? `${tr.spectrum.title}: ${tr.spectrum.bands(n)}, ${bandRangeLabel(0)} – ${bandRangeLabel(n - 1)}, ${tr.spectrum.unweighted}, ${scale.min}–${scale.max} dB. ${tr.spectrum.cutNote}`
      : undefined;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card px-[18px] pb-3 pt-3.5">
      <div className="flex items-baseline justify-between">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: isLive ? undefined : "var(--sw-sound)" }}
        >
          <span className={isLive ? "text-muted-foreground/80" : ""}>
            <HelpLabel entry="spectrum">{tr.spectrum.title}</HelpLabel> · {isLive ? tr.spectrum.latest : fmtClock(reading.recordedAt)}
          </span>
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {tr.spectrum.bands(PLOTTED_BAND_COUNT)} · <HelpLabel entry="spectrum">{tr.spectrum.unweighted}</HelpLabel>
        </span>
      </div>

      {bars.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md bg-secondary text-[11px] text-muted-foreground">
          {tr.spectrum.none}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[28px_1fr] gap-x-1" role="img" aria-label={plotLabel}>
            <div aria-hidden="true" className="relative h-32">
              {ticks.map((t, i) => (
                <span
                  key={t}
                  className="absolute right-0 translate-y-1/2 text-[9px] tabular-nums text-muted-foreground/80"
                  style={{ bottom: `${pct(t)}%` }}
                >
                  {i === ticks.length - 1 ? `${t} dB` : t}
                </span>
              ))}
            </div>
            <div aria-hidden="true" className="relative h-32">
              {ticks.map((t) => (
                <div key={t} className="absolute inset-x-0 border-t border-border/60" style={{ bottom: `${pct(t)}%` }} />
              ))}
              <div className="relative z-10 flex h-32 items-end gap-1">
                {bars.map((b, i) => (
                  <div
                    key={b.label}
                    className="flex h-32 flex-1 flex-col justify-end"
                    title={
                      b.value == null
                        ? `${b.label} (${bandRangeLabel(i)})`
                        : `${b.label} (${bandRangeLabel(i)}): ${fmtDb(b.value)}`
                    }
                  >
                    <div
                      className="rounded-t-[2px]"
                      style={{
                        height: `${Math.max(b.value == null ? 0 : 3, b.height * 100)}%`,
                        backgroundColor: "var(--sw-slate)",
                        opacity: 0.85,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div />
            <div aria-hidden="true" className="flex gap-1">
              {bars.map((b) => (
                <div key={b.label} className="flex-1 basis-0 text-center text-[8.5px] tabular-nums text-muted-foreground/80">
                  {b.label}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-[9.5px] text-muted-foreground">{tr.spectrum.xAxis}</div>

          <div className="text-[11px] leading-[1.45] text-muted-foreground">
            <HelpLabel entry="spectrum">{tr.spectrum.cutNote}</HelpLabel>
          </div>
        </>
      )}
    </div>
  );
}

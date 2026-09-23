"use client";

// The interval in focus: live (newest row) by default, or the row the user
// clicked in the log. LAeq big in the level colour; every percentile through
// the censoring rule; the saturation chip only when there is something to say.
//
// The chevrons step one interval at a time without going back to the log,
// which is how someone taking reference measurements actually reads this
// page. Both destinations come from focusNav in src/lib/sensor/live.ts; the
// arrow keys are wired to the same two steps in SensorLivePage.

import type { ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { ApiReading } from "@/lib/api/schemas";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb } from "@/lib/dashboard/format";
import { LIVE_TONE_COLOR } from "@/lib/dashboard/liveness";
import { fmtClock, fmtDuty, fmtLevel, fmtLmax, fmtOptionalDb, isLowCoverage, isSaturated, type FocusNav } from "@/lib/sensor/live";
import { sensorStrings as tr } from "@/lib/strings/sensor";
import { GLOSSARY, METRICS, metricLabel, type GlossaryKey } from "@/lib/strings/glossary";
import HelpLabel from "./HelpLabel";

// Labels borrowed from the glossary's own metric names, rather than a second
// copy of "Μέση LAeq" etc. living here.
const LABELS = {
  hero: metricLabel("laeq"),
  lmax: metricLabel("lmax"),
  l10: metricLabel("l10"),
  l50: metricLabel("l50"),
  l90: metricLabel("l90"),
  lmin: metricLabel("lmin"),
  interval: GLOSSARY.interval.term,
};

function Stat({
  entry,
  label,
  text,
  tone,
  hint,
}: {
  entry: GlossaryKey;
  label: string;
  text: string;
  tone?: "lower" | "upper" | null;
  /** Overrides the entry's default tooltip — the sensor page's interval-scoped hint. */
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <HelpLabel
        entry={entry}
        text={hint}
        className="self-start text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80"
      >
        {label}
      </HelpLabel>
      <span className="text-[18px] font-semibold tabular-nums" style={tone === "lower" ? { color: "var(--sw-loud)" } : undefined}>
        {text}
      </span>
    </div>
  );
}

/** One step through the log. Disabled at either end rather than hidden, so
 *  the control does not move about as the focus travels. */
function StepButton({
  label,
  keyHint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  keyHint: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={tr.card.navKeyHint(label, keyHint)}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

export default function IntervalCard({
  reading,
  isLive,
  outsideWindow = false,
  onBackToLive,
  nav,
  onFocus,
}: {
  reading: ApiReading;
  isLive: boolean;
  /** The reading is the sensor's last known one but did not arrive inside the
   *  selected window — say so, so an old interval is not read as a live one. */
  outsideWindow?: boolean;
  onBackToLive: () => void;
  nav: FocusNav;
  /** Same setter the log uses: a key, or null for live. */
  onFocus: (key: string | null) => void;
}) {
  const stops = paletteStops();
  const l10 = fmtLevel(reading.l10, reading);
  const l50 = fmtLevel(reading.l50, reading);
  const l90 = fmtLevel(reading.l90, reading);
  const lmax = fmtLmax(reading);
  const lmin = fmtOptionalDb(reading.lminEst);
  const duty = fmtDuty(reading.realizedDuty);
  const durationS = reading.intervalMs != null ? reading.intervalMs / 1000 : reading.intervalS;
  // The count is only ever shown once isSaturated says there is one.
  const saturations = reading.energySaturations ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-[18px] pb-4 pt-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5">
          {isLive ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">{tr.card.latest}</h2>
          ) : (
            <>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sound">
                {tr.card.focused(fmtClock(reading.recordedAt))}
              </h2>
              {outsideWindow ? (
                // Nothing to go back to: this is the sensor's last known interval,
                // and the window it is being shown next to holds no rows at all.
                <span className="text-[11px] text-muted-foreground">{tr.card.outsideWindow}</span>
              ) : (
                <button
                  type="button"
                  onClick={onBackToLive}
                  className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: LIVE_TONE_COLOR.live }} />
                  {tr.card.backToLive}
                </button>
              )}
            </>
          )}

          {/* Hidden only when the window cannot be stepped at all (empty, or a
              single interval); otherwise present and disabled at the ends. */}
          {(nav.hasOlder || nav.hasNewer) && (
            <div className="inline-flex items-center gap-0.5">
              <StepButton
                label={tr.card.olderInterval}
                keyHint="←"
                disabled={!nav.hasOlder}
                onClick={() => onFocus(nav.older)}
              >
                <ChevronLeft className="size-4" />
              </StepButton>
              <StepButton
                label={tr.card.newerInterval}
                keyHint="→"
                disabled={!nav.hasNewer}
                onClick={() => onFocus(nav.newer)}
              >
                <ChevronRight className="size-4" />
              </StepButton>
              {!isLive && nav.total > 0 && (
                <span className="ml-1 text-[11px] tabular-nums text-muted-foreground/80">
                  {tr.card.position(nav.index + 1, nav.total)}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {tr.card.stamps(fmtClock(reading.recordedAt), fmtClock(reading.receivedAt))}
        </span>
      </div>

      <div className="flex items-baseline gap-2.5">
        <span
          className="text-[56px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: reading.laeq == null ? "var(--sw-silver)" : levelColor(reading.laeq, stops) }}
        >
          {reading.laeq == null ? "—" : fmtDb(reading.laeq)}
        </span>
        <span className="text-[12px] font-medium leading-tight text-muted-foreground">
          <HelpLabel entry="laeq" text={METRICS.laeq.hint.interval}>
            {LABELS.hero}
          </HelpLabel>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-3.5 gap-y-2.5">
        <Stat entry="lmax" label={LABELS.lmax} text={lmax.text} tone={lmax.bound} hint={METRICS.lmax.hint.interval} />
        <Stat entry="percentiles" label={LABELS.l10} text={l10.text} tone={l10.bound} hint={METRICS.l10.hint.interval} />
        <Stat entry="percentiles" label={LABELS.l50} text={l50.text} tone={l50.bound} hint={METRICS.l50.hint.interval} />
        <Stat entry="lmax" label={LABELS.lmin} text={lmin} />
        <Stat entry="percentiles" label={LABELS.l90} text={l90.text} tone={l90.bound} hint={METRICS.l90.hint.interval} />
        <Stat entry="interval" label={LABELS.interval} text={durationS != null ? tr.card.duration(fmtDb(durationS)) : "—"} />
      </div>

      {isSaturated(reading) && (
        <div
          className="inline-flex items-center gap-2 self-start rounded-md px-2.5 py-1.5 text-[12px]"
          style={{ color: "var(--sw-loud)", backgroundColor: "color-mix(in oklab, var(--sw-loud) 8%, transparent)" }}
        >
          <AlertTriangle className="size-3.5" />
          <HelpLabel entry="saturation">{tr.card.saturation(saturations, METRICS.laeq.label)}</HelpLabel>
        </div>
      )}

      {isLowCoverage(reading.realizedDuty) && (
        <div
          className="inline-flex items-center gap-2 self-start rounded-md px-2.5 py-1.5 text-[12px]"
          style={{ color: "var(--sw-slate)", backgroundColor: "color-mix(in oklab, var(--sw-slate) 8%, transparent)" }}
        >
          <AlertTriangle className="size-3.5" />
          <HelpLabel entry="coverage">{tr.card.lowCoverage(duty)}</HelpLabel>
        </div>
      )}
    </div>
  );
}

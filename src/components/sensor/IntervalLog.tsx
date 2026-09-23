"use client";

// Every interval in the window, newest first. Rows are buttons: clicking one
// puts it in focus (card + spectrum follow); clicking the newest, or the
// card's button, returns to live. Saturation is a mark after Lmax, only
// when non-zero — never a column of zeros.

import { memo } from "react";
import { Download } from "lucide-react";
import type { ApiReading } from "@/lib/api/schemas";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import { fmtClock, fmtDuty, fmtLevel, fmtLmax, fmtOptionalDb, isLowCoverage, isSaturated } from "@/lib/sensor/live";
import { sensorStrings as tr } from "@/lib/strings/sensor";
import { METRICS } from "@/lib/strings/glossary";
import HelpLabel from "./HelpLabel";

export const WINDOW_HOURS = [1, 3, 12, 24] as const;
export type WindowHours = (typeof WINDOW_HOURS)[number];

const GRID = "grid grid-cols-[86px_72px_64px_64px_64px_72px_64px_minmax(0,1fr)] items-center gap-x-3";

// One row of the log, memoised on primitive/immutable props. Rows are
// immutable once merged (mergeReadings never mutates an existing reading), so
// a poll only re-renders the newest 20 rows the poll brings, not the whole
// window.
const LogRow = memo(function LogRow({
  reading,
  selected,
  newest,
  live,
  onPick,
  stops,
}: {
  reading: ApiReading;
  selected: boolean;
  newest: boolean;
  /** Whether the page is live (nothing focused) — tints the newest row. */
  live: boolean;
  onPick: (key: string | null) => void;
  stops: ReturnType<typeof paletteStops>;
}) {
  const l10 = fmtLevel(reading.l10, reading);
  const l50 = fmtLevel(reading.l50, reading);
  const l90 = fmtLevel(reading.l90, reading);
  const lmax = fmtLmax(reading);
  const laeqText = reading.laeq == null ? "—" : fmtDb(reading.laeq);
  const lminText = fmtOptionalDb(reading.lminEst);
  const saturated = isSaturated(reading);
  const lowCoverage = isLowCoverage(reading.realizedDuty);

  // Every value named with its metric, so a screen reader announces one
  // row as a sentence instead of nine bare numbers (the inner <span>s below
  // are aria-hidden so the values aren't read twice).
  const rowLabel = [
    `${tr.log.colTime} ${fmtClock(reading.receivedAt)}`,
    `${tr.log.deviceTimeLabel} ${fmtClock(reading.recordedAt)}`,
    `${METRICS.laeq.label} ${laeqText}`,
    `${METRICS.l10.label} ${l10.text}`,
    `${METRICS.l50.label} ${l50.text}`,
    `${METRICS.l90.label} ${l90.text}`,
    `${METRICS.lmax.label} ${lmax.text}`,
    `${METRICS.lmin.label} ${lminText}`,
    ...(saturated ? [tr.card.saturation(reading.energySaturations ?? 0, METRICS.laeq.label)] : []),
    ...(lowCoverage ? [tr.card.lowCoverage(fmtDuty(reading.realizedDuty))] : []),
  ].join(", ");

  return (
    <button
      type="button"
      onClick={() => onPick(newest ? null : reading.recordedAt)}
      aria-pressed={selected}
      aria-label={rowLabel}
      title={`${tr.log.deviceTimeLabel} ${fmtClock(reading.recordedAt)}`}
      className={cn(
        GRID,
        "border-b border-border/60 px-[18px] py-[7px] text-left text-[12.5px] tabular-nums transition-colors hover:bg-secondary/60",
        selected && "bg-sound/10 shadow-[inset_3px_0_0_var(--sw-sound)]",
        !selected && newest && live && "bg-sound/5"
      )}
    >
      <span aria-hidden="true">{fmtClock(reading.receivedAt)}</span>
      <span aria-hidden="true" className="text-right font-semibold" style={{ color: reading.laeq == null ? undefined : levelColor(reading.laeq, stops) }}>
        {laeqText}
      </span>
      <span aria-hidden="true" className="text-right" style={l10.bound === "lower" ? { color: "var(--sw-loud)" } : undefined}>{l10.text}</span>
      <span aria-hidden="true" className="text-right">{l50.text}</span>
      <span aria-hidden="true" className="text-right" style={l90.bound === "upper" ? { color: "var(--sw-slate)" } : undefined}>{l90.text}</span>
      <span aria-hidden="true" className="text-right" style={lmax.bound === "lower" ? { color: "var(--sw-loud)" } : undefined}>
        {lmax.text}
        {saturated && (
          <span
            title={tr.card.saturation(reading.energySaturations ?? 0, METRICS.laeq.label)}
            aria-hidden="true"
            style={{ color: "var(--sw-loud)" }}
          >
            {" "}▲
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-right">
        {lminText}
        {lowCoverage && (
          <span title={tr.card.lowCoverage(fmtDuty(reading.realizedDuty))} aria-hidden="true" style={{ color: "var(--sw-slate)" }}>
            {" "}▽
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sound">
        {selected ? tr.log.selectedTag : newest ? tr.log.newTag : ""}
      </span>
    </button>
  );
});

function IntervalLog({
  readings,
  focusKey,
  onFocus,
  windowHours,
  onWindowChange,
  cadenceS,
  pollS,
  onCsv,
  csvBusy,
}: {
  readings: ApiReading[];
  /** recordedAt of the focused row, or null when live. */
  focusKey: string | null;
  onFocus: (recordedAt: string | null) => void;
  windowHours: WindowHours;
  onWindowChange: (h: WindowHours) => void;
  cadenceS: number;
  pollS: number;
  onCsv: () => void;
  csvBusy: boolean;
}) {
  const stops = paletteStops();
  const live = focusKey == null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-[18px] py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">{tr.log.title}</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">{tr.log.summary(windowHours, readings.length)}</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sw-window" className="text-[11px] text-muted-foreground">
            {tr.log.window}
          </label>
          <select
            id="sw-window"
            value={windowHours}
            onChange={(e) => onWindowChange(Number(e.target.value) as WindowHours)}
            className="rounded-md border bg-card px-2 py-1 text-[12px]"
          >
            {WINDOW_HOURS.map((h) => (
              <option key={h} value={h}>
                {tr.log.windowOption(h)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCsv}
            disabled={csvBusy || readings.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-sound/40 px-3 py-1.5 text-[12px] font-medium text-sound transition-colors hover:bg-sound/10 disabled:opacity-40"
          >
            <Download className="size-3.5" />
            {csvBusy ? tr.log.csvBusy : tr.log.csv}
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={cn(GRID, "border-b px-[18px] py-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80")}
      >
        <HelpLabel entry="clocks">{tr.log.colTime}</HelpLabel>
        <span className="text-right">{METRICS.laeq.code}</span>
        <span className="text-right">{METRICS.l10.code}</span>
        <span className="text-right">{METRICS.l50.code}</span>
        <span className="text-right">{METRICS.l90.code}</span>
        <span className="text-right">{METRICS.lmax.code}</span>
        <span className="text-right">{METRICS.lmin.code}</span>
        <span />
      </div>

      <div className="flex max-h-[60vh] flex-col overflow-y-auto">
        {readings.length === 0 && <div className="px-[18px] py-6 text-[12px] text-muted-foreground">{tr.log.empty}</div>}
        {readings.map((r, i) => (
          <LogRow
            key={r.recordedAt}
            reading={r}
            selected={focusKey != null && r.recordedAt === focusKey}
            newest={i === 0}
            live={live}
            onPick={onFocus}
            stops={stops}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-2.5 text-[11px] text-muted-foreground">
        {/* Both caveats about the file sit where the file is downloaded: what
            «≥» means, and what the download actually contains. */}
        <div className="flex flex-col items-start gap-1">
          <HelpLabel entry="lowerBound">{tr.log.boundNote}</HelpLabel>
          <HelpLabel entry="export">{tr.log.csvNote}</HelpLabel>
        </div>
        <span className="tabular-nums">{tr.log.cadenceNote(cadenceS, pollS)}</span>
      </div>
    </div>
  );
}

export default memo(IntervalLog);

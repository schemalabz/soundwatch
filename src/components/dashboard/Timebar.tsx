"use client";

// The time seeker — the signature element of the dashboard. A thin precise
// rail spanning the full data range: filter-selected periods glow in the
// sound accent, a fine needle marks the playback cursor, and the right end
// is the live zone (pulsing "Xs" freshness). Horizontal on desktop; on
// mobile it turns vertical and thinner, newest at the top.
//
// All time math (segments, snapping, gap-skipping playback) lives in
// src/lib/dashboard/filters.ts and is unit-tested; this component only does
// geometry and pointer handling.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Rabbit, Turtle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { snapToSegments, type TimeSegment } from "@/lib/dashboard/filters";
import { computeGraduations } from "@/lib/dashboard/graduations";
import { ATHENS_TZ } from "@/lib/dashboard/time";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";

export const PLAYBACK_SPEEDS = [
  { label: "1λ/δ", labelEn: "1m/s", simSecondsPerRealSecond: 60 },
  { label: "10λ/δ", labelEn: "10m/s", simSecondsPerRealSecond: 600 },
  { label: "1ω/δ", labelEn: "1h/s", simSecondsPerRealSecond: 3600 },
  { label: "6ω/δ", labelEn: "6h/s", simSecondsPerRealSecond: 21600 },
] as const;

export type BarMode = "instants" | "aggregate";
export type AggKey = "laeq" | "l50" | "l10" | "l90" | "lmax";
export const AGG_KEYS: AggKey[] = ["laeq", "l50", "l10", "l90", "lmax"];

export interface TimebarProps {
  rangeStartMs: number;
  nowMs: number;
  segments: TimeSegment[];
  /** True when any filter narrows time (segments ≠ whole range). */
  filtered: boolean;
  cursor: number | "live";
  playing: boolean;
  speedIndex: number;
  liveAllowed: boolean;
  freshSecondsAgo: number | null;
  orientation: "horizontal" | "vertical";
  locale: string;
  labels: { live: string; liveExcluded: string; play: string; pause: string; speed: string };
  mode: BarMode;
  aggKey: AggKey;
  aggLoading: boolean;
  onModeChange: (mode: BarMode) => void;
  onAggChange: (key: AggKey) => void;
  onCursorChange: (cursor: number | "live") => void;
  onPlayToggle: () => void;
  onSpeedSelect: (index: number) => void;
}

export default function Timebar(props: TimebarProps) {
  return props.orientation === "vertical" ? <VerticalTimebar {...props} /> : <HorizontalTimebar {...props} />;
}

/* ------------------------------------------------------------------ */
/* shared pieces                                                       */
/* ------------------------------------------------------------------ */

function useCursorMs(p: TimebarProps): number {
  return p.cursor === "live" ? p.nowMs : p.cursor;
}

function useFraction(p: TimebarProps): (t: number) => number {
  const { rangeStartMs, nowMs } = p;
  return useCallback(
    (t: number) => Math.min(1, Math.max(0, (t - rangeStartMs) / Math.max(1, nowMs - rangeStartMs))),
    [rangeStartMs, nowMs]
  );
}

function useCursorLabel(p: TimebarProps): string {
  const cursorMs = useCursorMs(p);
  return useMemo(
    () =>
      new Intl.DateTimeFormat(p.locale, {
        timeZone: ATHENS_TZ,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(cursorMs),
    [p.locale, cursorMs]
  );
}

/** Observed pixel length of the rail along its axis. */
function useRailLength(ref: React.RefObject<HTMLDivElement | null>, axis: "x" | "y"): number {
  const [length, setLength] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver fires once on observe, covering the initial measure.
    const ro = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setLength(axis === "x" ? box.width : box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, axis]);
  return length;
}

/** Ruler graduations (months full-height, weeks/days shorter), density-adaptive. */
function useGraduations(p: TimebarProps, pxLength: number) {
  const { rangeStartMs, nowMs, locale } = p;
  // Quantized to the minute: the walk over ~90 Athens midnights is not free.
  const startMin = Math.floor(rangeStartMs / 60_000) * 60_000;
  const nowMin = Math.floor(nowMs / 60_000) * 60_000;
  const pxBucket = Math.round(pxLength / 24) * 24; // re-layout on real changes only
  return useMemo(
    () => computeGraduations(startMin, nowMin, pxBucket, locale),
    [startMin, nowMin, pxBucket, locale]
  );
}

function usePointerScrub(p: TimebarProps, axis: "x" | "y") {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);

  const fractionFromEvent = useCallback(
    (e: React.PointerEvent): number => {
      const rect = railRef.current!.getBoundingClientRect();
      const raw =
        axis === "x"
          ? (e.clientX - rect.left) / rect.width
          : 1 - (e.clientY - rect.top) / rect.height; // vertical: newest on top
      return Math.min(1, Math.max(0, raw));
    },
    [axis]
  );

  const toTime = useCallback(
    (fraction: number): number => p.rangeStartMs + fraction * (p.nowMs - p.rangeStartMs),
    [p.rangeStartMs, p.nowMs]
  );

  const commit = useCallback(
    (fraction: number, snap: boolean) => {
      // The last ~1% of the rail is the live edge: release there = go live.
      if (fraction > 0.995 && p.liveAllowed) {
        p.onCursorChange("live");
        return;
      }
      const t = toTime(fraction);
      p.onCursorChange(snap ? snapToSegments(p.segments, t) : t);
    },
    [p, toTime]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      commit(fractionFromEvent(e), false);
    },
    [commit, fractionFromEvent]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const f = fractionFromEvent(e);
      if (dragging) commit(f, false);
      else setHoverFraction(f);
    },
    [dragging, commit, fractionFromEvent]
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      setDragging(false);
      commit(fractionFromEvent(e), true);
    },
    [commit, fractionFromEvent]
  );
  const onPointerLeave = useCallback(() => setHoverFraction(null), []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = (e.shiftKey ? 24 : 1) * 3600_000;
      const cursorMs = p.cursor === "live" ? p.nowMs : p.cursor;
      const fwdKey = axis === "x" ? "ArrowRight" : "ArrowUp";
      const backKey = axis === "x" ? "ArrowLeft" : "ArrowDown";
      if (e.key === fwdKey) {
        e.preventDefault();
        const t = Math.min(p.nowMs, cursorMs + step);
        p.onCursorChange(t >= p.nowMs && p.liveAllowed ? "live" : snapToSegments(p.segments, t));
      } else if (e.key === backKey) {
        e.preventDefault();
        p.onCursorChange(snapToSegments(p.segments, Math.max(p.rangeStartMs, cursorMs - step)));
      } else if (e.key === "Home") {
        e.preventDefault();
        p.onCursorChange(snapToSegments(p.segments, p.rangeStartMs));
      } else if (e.key === "End") {
        e.preventDefault();
        p.onCursorChange(p.liveAllowed ? "live" : snapToSegments(p.segments, p.nowMs));
      } else if (e.key === " ") {
        e.preventDefault();
        p.onPlayToggle();
      }
    },
    [p, axis]
  );

  return { railRef, dragging, hoverFraction, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onKeyDown };
}

/** The complement of the selected segments within the domain. */
function gaps(p: TimebarProps): TimeSegment[] {
  const out: TimeSegment[] = [];
  let cursor = p.rangeStartMs;
  for (const s of p.segments) {
    if (s.startMs > cursor) out.push({ startMs: cursor, endMs: s.startMs });
    cursor = Math.max(cursor, s.endMs);
  }
  if (cursor < p.nowMs) out.push({ startMs: cursor, endMs: p.nowMs });
  return out;
}

/** The mode tabs: underlined, active underline in the sound accent. */
function ModeTabs({ p, compact }: { p: TimebarProps; compact?: boolean }) {
  return (
    <div className={cn("flex", compact ? "flex-col gap-0.5 px-1" : "gap-4 px-1")} role="tablist">
      {(["instants", "aggregate"] as BarMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={p.mode === m}
          onClick={() => p.onModeChange(m)}
          className={cn(
            "border-b-2 pb-0.5 font-medium tracking-tight transition-colors",
            compact ? "text-[8.5px]" : "text-[11px]",
            p.mode === m
              ? "border-sound text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tr.modes[m]}
        </button>
      ))}
    </div>
  );
}

/** The shared metric picker: every frame window AND every aggregate is
 *  computed with this — common to both modes. */
function MetricChips({ p, compact }: { p: TimebarProps; compact?: boolean }) {
  return (
    <div className={cn("flex items-center", compact ? "flex-col gap-1 px-1" : "gap-1")}>
      {AGG_KEYS.map((k) => {
        const active = p.aggKey === k;
        return (
          <Tooltip key={k}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => p.onAggChange(k)}
                className={cn(
                  "rounded-md border font-medium transition-colors",
                  compact ? "w-full px-1 py-0.5 text-[8px]" : "px-2 py-0.5 text-[10.5px]",
                  active
                    ? "border-sound/50 bg-sound/12 text-foreground"
                    : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {tr.aggregations[k].label}
              </button>
            </TooltipTrigger>
            <TooltipContent side={compact ? "left" : "bottom"}>{tr.aggregations[k].hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Aggregate mode's content row: just the explanation + compute state. */
function AggregatePanel({ p, compact }: { p: TimebarProps; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-1 items-center justify-center px-1 text-center text-[8px] leading-tight text-muted-foreground">
        {p.aggLoading ? "…" : tr.aggregations[p.aggKey].label}
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center px-2 text-[11px] text-muted-foreground">
      {p.aggLoading ? "Υπολογισμός…" : tr.aggregations[p.aggKey].hint}
    </div>
  );
}

function LiveZone({ p, compact }: { p: TimebarProps; compact?: boolean }) {
  const isLive = p.cursor === "live";
  const zone = (
    <button
      type="button"
      disabled={!p.liveAllowed}
      onClick={() => p.liveAllowed && p.onCursorChange("live")}
      className={cn(
        "group flex select-none items-center gap-1.5 outline-none transition-opacity",
        compact ? "flex-col gap-1 py-1" : "px-1",
        !p.liveAllowed && "opacity-40"
      )}
      aria-label={p.liveAllowed ? p.labels.live : p.labels.liveExcluded}
    >
      <span className="relative flex size-2">
        {isLive && p.liveAllowed && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sound opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            p.liveAllowed ? (isLive ? "bg-sound" : "bg-slate group-hover:bg-sound") : "bg-silver"
          )}
        />
      </span>
      <span className={cn("flex", compact ? "flex-col items-center" : "flex-col items-start")}>
        <span
          className={cn(
            "text-[10px] font-semibold leading-none tracking-[0.14em]",
            isLive && p.liveAllowed ? "text-foreground" : "text-muted-foreground"
          )}
        >
          LIVE
        </span>
        {p.freshSecondsAgo != null && p.liveAllowed && (
          <span className="relative mt-0.5 leading-none">
            <span className="text-[10px] tabular-nums text-muted-foreground">{p.freshSecondsAgo}s</span>
            {isLive && (
              <span className="sw-live-underline absolute -bottom-[3px] left-0 right-0 h-px rounded bg-sound" />
            )}
          </span>
        )}
      </span>
    </button>
  );
  if (p.liveAllowed) return zone;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{zone}</span>
      </TooltipTrigger>
      <TooltipContent side={compact ? "left" : "top"}>{p.labels.liveExcluded}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The speed picker: one line — tortoise, current value, rabbit — with four
 * underline dashes stretched beneath the whole line (icons included), the
 * active dash lit. Clicking the line cycles; dashes select directly.
 */
function SpeedLadder({ p }: { p: TimebarProps }) {
  const label = p.locale === "el" ? PLAYBACK_SPEEDS[p.speedIndex].label : PLAYBACK_SPEEDS[p.speedIndex].labelEn;
  return (
    <div className="flex flex-col items-stretch gap-[3px]" role="group" aria-label={p.labels.speed}>
      <button
        type="button"
        onClick={() => p.onSpeedSelect((p.speedIndex + 1) % PLAYBACK_SPEEDS.length)}
        aria-label={p.labels.speed}
        className="flex items-center justify-center gap-1.5 text-[10px] font-medium tabular-nums leading-none tracking-tight text-muted-foreground transition-colors hover:text-foreground"
      >
        <Turtle className="size-3 shrink-0 opacity-55" />
        <span className="w-[2.2rem] text-center">{label}</span>
        <Rabbit className="size-3 shrink-0 opacity-55" />
      </button>
      <div className="flex items-center gap-[3px]">
        {PLAYBACK_SPEEDS.map((s, i) => (
          <button
            key={i}
            type="button"
            aria-label={p.locale === "el" ? s.label : s.labelEn}
            aria-pressed={i === p.speedIndex}
            title={p.locale === "el" ? s.label : s.labelEn}
            onClick={() => p.onSpeedSelect(i)}
            className={cn(
              "h-[3px] flex-1 rounded-full transition-colors",
              i === p.speedIndex ? "bg-sound" : "bg-silver/45 hover:bg-silver/80"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function PlayControls({ p, vertical }: { p: TimebarProps; vertical?: boolean }) {
  return (
    <div className={cn("flex items-center", vertical ? "flex-col gap-1" : "gap-1.5")}>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full text-foreground hover:bg-secondary"
        onClick={p.onPlayToggle}
        aria-label={p.playing ? p.labels.pause : p.labels.play}
      >
        {p.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </Button>
      <SpeedLadder p={p} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* horizontal (desktop)                                                */
/* ------------------------------------------------------------------ */

function HorizontalTimebar(p: TimebarProps) {
  const fraction = useFraction(p);
  const cursorMs = useCursorMs(p);
  const cursorLabel = useCursorLabel(p);
  const { railRef, dragging, hoverFraction, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onKeyDown } =
    usePointerScrub(p, "x");
  const railLength = useRailLength(railRef, "x");
  const graduations = useGraduations(p, railLength);
  const isLive = p.cursor === "live";
  const cursorF = fraction(cursorMs);

  return (
    <div className="pointer-events-auto flex h-[6rem] flex-col rounded-xl border bg-card/95 pl-2 pr-3 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm">
      <div className="flex items-center justify-between pl-1 pr-1 pt-1.5">
        <ModeTabs p={p} />
        <MetricChips p={p} />
      </div>
      {p.mode === "aggregate" ? (
        <AggregatePanel p={p} />
      ) : (
      <div className="flex flex-1 items-stretch gap-2.5">
      <div className="flex items-center">
        <PlayControls p={p} />
      </div>

      {/* rail */}
      <div
        ref={railRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={p.rangeStartMs}
        aria-valuemax={p.nowMs}
        aria-valuenow={cursorMs}
        aria-valuetext={cursorLabel}
        className="group relative my-2 flex-1 cursor-crosshair touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      >
        {/* filter-excluded periods read as disabled: muted washes over the gaps */}
        {p.filtered &&
          gaps(p).map((g) => {
            const left = fraction(g.startMs) * 100;
            const width = Math.max(0.12, (fraction(g.endMs) - fraction(g.startMs)) * 100);
            return (
              <div
                key={g.startMs}
                className="absolute inset-y-0 bg-silver/30"
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}
        {/* graduations: majors span the full height, mids/minors center on the axis */}
        {graduations.map((g) => (
          <div
            key={`${g.size}-${g.fraction}`}
            className={cn(
              "pointer-events-none absolute w-px",
              g.size === "major" && "inset-y-0 bg-silver/60",
              g.size === "mid" && "top-1/2 h-[38%] -translate-y-1/2 bg-silver/70",
              g.size === "minor" && "top-1/2 h-[16%] -translate-y-1/2 bg-silver/45"
            )}
            style={{ left: `${g.fraction * 100}%` }}
          >
            {g.size === "major" && g.sectionLabel && (
              <div className="absolute left-1.5 top-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {g.sectionLabel}
              </div>
            )}
          </div>
        ))}
        {/* cell numbers live in the middle of their interval, clear of any tick */}
        {graduations
          .filter((g) => g.cellLabel)
          .map((g) => (
            <div
              key={`label-${g.fraction}`}
              className="pointer-events-none absolute bottom-0.5 -translate-x-1/2 text-[8px] tabular-nums leading-none text-muted-foreground/60"
              style={{ left: `${(g.fraction + (g.cellSpan ?? 0) / 2) * 100}%` }}
            >
              {g.cellLabel}
            </div>
          ))}
        {/* hover ghost */}
        {hoverFraction != null && !dragging && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-slate/40"
            style={{ left: `${hoverFraction * 100}%` }}
          />
        )}
        {/* needle */}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 -translate-x-1/2 transition-transform",
            dragging ? "" : "duration-150"
          )}
          style={{ left: `${cursorF * 100}%` }}
        >
          <div className="mx-auto h-full w-[1.5px] bg-ink" />
          <div className="absolute left-1/2 top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-card" />
        </div>
        {/* cursor time chip */}
        {!isLive && (
          <div
            className="pointer-events-none absolute -top-1 -translate-x-1/2 whitespace-nowrap rounded border bg-card px-1 py-px text-[9.5px] font-medium tabular-nums leading-tight text-foreground shadow-sm"
            style={{ left: `min(max(${cursorF * 100}%, 2.5rem), calc(100% - 2.5rem))` }}
          >
            {cursorLabel}
          </div>
        )}
      </div>

      <div className="my-2 w-px bg-border" />
      <div className="flex items-center">
        <LiveZone p={p} />
      </div>
      </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* vertical (mobile) — thinner, newest at the top                      */
/* ------------------------------------------------------------------ */

function VerticalTimebar(p: TimebarProps) {
  const fraction = useFraction(p);
  const cursorMs = useCursorMs(p);
  const cursorLabel = useCursorLabel(p);
  const { railRef, dragging, hoverFraction, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onKeyDown } =
    usePointerScrub(p, "y");
  void dragging;
  void hoverFraction;
  const railLength = useRailLength(railRef, "y");
  const graduations = useGraduations(p, railLength);
  const isLive = p.cursor === "live";
  const cursorF = fraction(cursorMs);

  return (
    <div className="pointer-events-auto flex w-12 flex-col items-stretch gap-1.5 rounded-xl border bg-card/95 py-2 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm">
      <ModeTabs p={p} compact />
      <MetricChips p={p} compact />
      <div className="mx-3 h-px bg-border" />
      {p.mode === "aggregate" ? (
        <AggregatePanel p={p} compact />
      ) : (
      <>
      <div className="flex justify-center">
        <LiveZone p={p} compact />
      </div>
      <div className="mx-3 h-px bg-border" />

      {/* rail */}
      <div
        ref={railRef}
        role="slider"
        aria-orientation="vertical"
        tabIndex={0}
        aria-valuemin={p.rangeStartMs}
        aria-valuemax={p.nowMs}
        aria-valuenow={cursorMs}
        aria-valuetext={cursorLabel}
        className="relative mx-1.5 flex-1 cursor-crosshair touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      >
        {/* filter-excluded periods read as disabled */}
        {p.filtered &&
          gaps(p).map((g) => {
            const top = (1 - fraction(g.endMs)) * 100;
            const height = Math.max(0.12, (fraction(g.endMs) - fraction(g.startMs)) * 100);
            return (
              <div
                key={g.startMs}
                className="absolute inset-x-0 bg-silver/30"
                style={{ top: `${top}%`, height: `${height}%` }}
              />
            );
          })}
        {/* graduations: majors span the full width, mids/minors grow from the left */}
        {graduations.map((g) => (
          <div
            key={`${g.size}-${g.fraction}`}
            className={cn(
              "pointer-events-none absolute h-px",
              g.size === "major" && "inset-x-0 bg-silver/60",
              g.size === "mid" && "left-0 w-[34%] bg-silver/70",
              g.size === "minor" && "left-0 w-[15%] bg-silver/45"
            )}
            style={{ top: `${(1 - g.fraction) * 100}%` }}
          >
            {g.size === "major" && g.sectionLabel && (
              <div
                className={cn(
                  "absolute left-0.5 whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                  g.fraction === 0 ? "bottom-0.5" : "top-0.5"
                )}
              >
                {g.sectionLabel}
              </div>
            )}
          </div>
        ))}
        {graduations
          .filter((g) => g.cellLabel)
          .map((g) => (
            <div
              key={`label-${g.fraction}`}
              className="pointer-events-none absolute right-0.5 -translate-y-1/2 text-[7.5px] tabular-nums leading-none text-muted-foreground/60"
              style={{ top: `${(1 - g.fraction - (g.cellSpan ?? 0) / 2) * 100}%` }}
            >
              {g.cellLabel}
            </div>
          ))}
        {/* needle */}
        <div
          className="pointer-events-none absolute inset-x-0 -translate-y-1/2"
          style={{ top: `${(1 - cursorF) * 100}%` }}
        >
          <div className="h-[1.5px] w-full bg-ink" />
          <div className="absolute left-1/2 top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-card" />
        </div>
        {/* cursor chip: floats left of the rail */}
        {!isLive && (
          <div
            className="pointer-events-none absolute right-full mr-1.5 -translate-y-1/2 whitespace-nowrap rounded border bg-card px-1 py-px text-[9.5px] font-medium tabular-nums text-foreground shadow-sm"
            style={{ top: `min(max(${(1 - cursorF) * 100}%, 0.75rem), calc(100% - 0.75rem))` }}
          >
            {cursorLabel}
          </div>
        )}
      </div>

      <div className="mx-3 h-px bg-border" />
      <div className="flex justify-center">
        <PlayControls p={p} vertical />
      </div>
      </>
      )}
    </div>
  );
}

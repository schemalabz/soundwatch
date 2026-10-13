"use client";

// The map's rail: a moment, and how each place compares with its own usual.
//
// The level is the map's message (the circles); this rail only says how many
// places are outside their usual, lists the day's departures so far, and
// accounts for the rest of the network. No filter chips: on the map, time is
// the timebar; the chips live beside the summary. The rule the counts follow
// is src/lib/dashboard/usual.ts.

import { memo, useMemo } from "react";
import Link from "next/link";
import Lockup from "@/components/brand/Lockup";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import { ATHENS_TZ } from "@/lib/dashboard/time";
import { countVersusUsual, fmtDelta, usualDelta } from "@/lib/dashboard/usual";
import type { FrameData } from "@/lib/dashboard/frames";
import type { DeparturesResponse, UsualBand } from "@/lib/api/dashboard";
import type { FreshnessResponse } from "@/types/freshness";
import type { SensorMeta } from "./SensorLayer";
import { devRenderCount } from "@/lib/dashboard/devtools";

/** A unit silent longer than this has left the network, not just the morning. */
const OFFLINE_S = 7 * 86_400;
const DEPARTURES_SHOWN = 8;

export interface NowRailProps {
  /** The moment on display: the frame's end. Minute-quantized by the shell. */
  cursorMs: number;
  live: boolean;
  /** The trailing window the circles aggregate over. */
  windowS: number;
  sensors: SensorMeta[];
  /** The frame the circles show right now (null until the first lands). */
  frame: FrameData | null;
  /** Each sensor's band for the cursor's hour; null until known. */
  usual: Record<string, UsualBand> | null;
  departures: DeparturesResponse | null;
  freshness: FreshnessResponse | null;
  onJumpTo: (epochMs: number) => void;
  onSensorClick: (sensorId: string) => void;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ATHENS_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const clockFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function Pill({ delta, className }: { delta: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums leading-none tracking-[0.02em]",
        delta > 0 ? "bg-foreground text-background" : "border border-slate bg-card text-slate",
        className
      )}
    >
      {fmtDelta(delta)}
    </span>
  );
}

function NowRail(p: NowRailProps) {
  devRenderCount("NowRail");

  const counts = useMemo(() => {
    const versus = countVersusUsual(p.sensors.map((s) => s.id), p.frame, p.usual);
    let silent = 0;
    let offline = 0;
    // On a scrubbed frame an absent value just means no readings then; the
    // liveness split only makes sense for now.
    if (p.live) {
      const ages = new Map<string, number | null>();
      for (const s of p.freshness?.sensors ?? []) ages.set(s.id, s.secondsAgo);
      for (const s of p.sensors) {
        if (p.frame?.[s.id]) continue;
        const age = ages.get(s.id);
        if (age == null || age >= OFFLINE_S) offline++;
        else silent++;
      }
    }
    return { ...versus, silent, offline };
  }, [p.sensors, p.frame, p.usual, p.freshness, p.live]);

  const names = useMemo(() => new Map(p.sensors.map((s) => [s.id, s.name ?? s.address ?? s.id.slice(0, 8)])), [p.sensors]);

  const statusLine = (() => {
    const parts: string[] = [];
    if (counts.above > 0) parts.push(tr.now.above(counts.above));
    if (counts.below > 0) parts.push(tr.now.below(counts.below));
    return parts.length > 0 ? parts.join(" · ") : counts.measured > 0 ? tr.now.allUsual : "";
  })();

  // The simulator departs hundreds of times a day; the fleet, a handful. A
  // rail is not a log: the newest few, and a count for the rest.
  const allEpisodes = p.departures?.episodes ?? [];
  const episodes = allEpisodes.slice(0, DEPARTURES_SHOWN);
  // While the band is unknown the counts are meaningless; say so once.
  const ready = p.frame != null && p.usual != null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <Lockup size="md" />
      </div>

      {/* the moment */}
      <div className="border-y bg-card px-5 py-4">
        <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-medium text-muted-foreground">
          {p.live && (
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sound opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-sound" />
            </span>
          )}
          <span className="truncate tabular-nums">
            {dateFmt.format(p.cursorMs)} · {clockFmt.format(p.cursorMs - p.windowS * 1000)}–{clockFmt.format(p.cursorMs)}
          </span>
        </div>
        <p className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {p.live ? tr.now.titleLive : tr.now.title}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-foreground/75">
          {ready ? (
            <>
              <span className="tabular-nums">{p.live ? tr.now.live(counts.measured) : tr.now.atMoment(counts.measured)}</span>
              {statusLine && (
                <>
                  {" · "}
                  <span className={cn("font-semibold", counts.above > 0 ? "text-foreground" : "")}>{statusLine}</span>
                </>
              )}
            </>
          ) : (
            tr.now.loading
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{tr.now.metricLine(tr.pane.liveWindow(p.windowS))}</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* the day's departures */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {p.live ? tr.now.departures : tr.now.departuresUntil(clockFmt.format(p.cursorMs))}
            </div>
            {episodes.length > 0 && <span className="text-[10px] text-muted-foreground max-md:hidden">{tr.now.departuresHint}</span>}
          </div>
          {p.departures == null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-silver/30" />
              ))}
            </div>
          ) : episodes.length === 0 ? (
            <p className="text-[12px] leading-snug text-muted-foreground">{tr.now.noDepartures}</p>
          ) : (
            <ol className="flex flex-col">
              {episodes.map((e) => {
                const delta = usualDelta(e.peakLaeq, e);
                return (
                  <li key={`${e.sensorId}:${e.startMs}`} className="border-t last:border-b">
                    <button
                      type="button"
                      onClick={() => {
                        p.onJumpTo(e.peakAtMs);
                        p.onSensorClick(e.sensorId);
                      }}
                      className="grid min-h-11 w-full grid-cols-[2.6rem_1fr_auto] items-baseline gap-2 px-1 py-2 text-left transition-colors hover:bg-silver/20"
                    >
                      <span className="text-[11.5px] tabular-nums text-muted-foreground">{clockFmt.format(e.peakAtMs)}</span>
                      <span className="min-w-0 text-[12.5px] leading-snug">
                        <span className="font-semibold">{names.get(e.sensorId) ?? e.sensorId.slice(0, 8)}</span>{" "}
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: e.verdict === "above" ? "var(--sw-level-loud)" : "var(--sw-slate)" }}
                        >
                          {Math.round(e.peakLaeq)}
                        </span>{" "}
                        <span className="text-[11px] text-muted-foreground">
                          {tr.now.usualRange(String(Math.round(e.l90)), String(Math.round(e.l10)))}
                          {e.ongoing && p.live && (
                            <>
                              {" · "}
                              <span className="relative mr-1 inline-flex size-1.5 align-middle">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sound opacity-60" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-sound" />
                              </span>
                              {tr.now.ongoing}
                            </>
                          )}
                        </span>
                      </span>
                      <Pill delta={delta} className="self-center" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {allEpisodes.length > episodes.length && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{tr.now.more(allEpisodes.length - episodes.length)}</p>
          )}
          <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">{tr.now.definition}</p>
        </section>

        {/* the rest of the network */}
        {ready && (
          <section>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tr.now.rest}</div>
            <ul className="flex flex-col gap-1.5 text-[11.5px] text-foreground/80">
              <li className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-full border border-slate bg-sound" />
                {tr.now.usual(counts.inside)}
              </li>
              {counts.noHistory > 0 && (
                <li className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full border border-dashed border-slate bg-sound/60" />
                  {tr.now.noHistory(counts.noHistory)}
                </li>
              )}
              {counts.silent > 0 && (
                <li className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full border-2 border-silver bg-card" />
                  {tr.now.silent(counts.silent)}
                </li>
              )}
              {counts.offline > 0 && (
                <li className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full border border-dashed border-silver" />
                  {tr.now.offline(counts.offline)}
                </li>
              )}
            </ul>
          </section>
        )}
      </div>

      <footer className="flex flex-wrap gap-x-3 gap-y-1 border-t px-5 py-3 text-[11px]">
        <Link href="/about" className="font-semibold text-foreground">
          {tr.footer.about}
        </Link>
        <span className="text-muted-foreground">{tr.footer.privacy}</span>
        <span className="text-muted-foreground">{tr.footer.terms}</span>
        <a href="/api/docs" title={tr.footer.apiTitle} className="text-muted-foreground hover:text-foreground">
          {tr.footer.api}
        </a>
        <Link href="/status" className="text-muted-foreground hover:text-foreground">
          {tr.footer.status}
        </Link>
      </footer>
    </div>
  );
}

// Re-renders when a frame, the band, the departures or the minute change —
// never on the shell's one-second wall clock.
export default memo(NowRail);

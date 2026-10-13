"use client";

// The sensor inspector: opens from a circle click. Identity, the level the
// circle shows big and colored, the one sentence that matters — how that
// level compares with this place's own usual for the hour — then the day
// drawn over the usual band, and liveness.
//
// The hero number is the frame the map shows at the cursor (live: the
// trailing window at now; scrubbed: the same window ending at the cursor),
// handed down by the shell, so the pane and the circle can never disagree.
// The band comes from /api/usual for this sensor; the rule it follows is
// src/lib/dashboard/usual.ts, the same one that draws the pill.

import { memo, useEffect, useMemo, useState } from "react";
import { BatteryMedium, MapPin, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtAgo, fmtDb, fmtExactTime } from "@/lib/dashboard/format";
import { liveStatus, LIVE_TONE_COLOR } from "@/lib/dashboard/liveness";
import { ATHENS_TZ, athensWallTime } from "@/lib/dashboard/time";
import { classify, hasSupport, usualDelta, usualEdges, usualWindow } from "@/lib/dashboard/usual";
import { dashboardStrings as tr, LOCALE } from "@/lib/strings/dashboard";
import type { SeriesResponse, UsualBand, UsualProfileResponse } from "@/lib/api/dashboard";
import UsualChart from "./charts/UsualChart";
import { devRenderCount } from "@/lib/dashboard/devtools";

interface SensorDetail {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  latestReading: {
    recordedAt: string;
    // Liveness reads this, never recordedAt. A unit dead for 20 minutes with a
    // clock 35 minutes fast would show ageS = 0 and a fresh green dot; after
    // an NTP correction the same unit reads stale while perfectly healthy.
    receivedAt: string;
    laeq: number | null;
    battery: number | null;
    rssi: number | null;
  } | null;
}

// The day's line refreshes on its own: the current hour's mean moves while
// you watch it.
const LIVE_REFRESH_MS = 60_000;

const whenFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: ATHENS_TZ, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function SensorPane({
  sensorId,
  windowS,
  cursorMs,
  live,
  level,
  usualBand,
  onClose,
  onGoToMap,
}: {
  sensorId: string;
  /** The live frame window (speed-dependent) — the hero must equal the circle. */
  windowS: number;
  /** The moment on display, minute-quantized; the circle's frame ends here. */
  cursorMs: number;
  live: boolean;
  /** The circle's value at the cursor; null while loading or without readings. */
  level: number | null;
  /** This sensor's usual band for the cursor's hour; undefined while loading. */
  usualBand?: UsualBand | null;
  onClose: () => void;
  /** Present outside the map view: jump to the map and fly to this sensor. */
  onGoToMap?: (lng: number, lat: number) => void;
}) {
  devRenderCount("SensorPane");
  // Payloads are tagged with the sensor they belong to; switching sensors
  // makes them stale by derivation (no state resets inside effects).
  const [detail, setDetail] = useState<{ id: string; value: SensorDetail } | null>(null);
  const [profile, setProfile] = useState<{ key: string; value: UsualProfileResponse } | null>(null);
  const [dayLine, setDayLine] = useState<{ key: string; value: (number | null)[] } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/sensors/${sensorId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: SensorDetail) => {
          if (!cancelled) setDetail({ id: sensorId, value: d });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sensorId]);

  // The band and the day's line are both keyed on the cursor's Athens day
  // and day type, so scrubbing within a day costs nothing and crossing
  // midnight refetches once.
  const win = useMemo(() => usualWindow(cursorMs), [cursorMs]);
  const dayKey = `${sensorId}:${win.dayStartMs}:${win.dayType}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/usual?sensor=${sensorId}&at=${win.dayStartMs + 3600_000}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: UsualProfileResponse) => {
        if (!cancelled) setProfile({ key: dayKey, value: body });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sensorId, dayKey, win.dayStartMs]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/series?from=${win.dayStartMs}&bucket=1h&sensor=${sensorId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((body: SeriesResponse) => {
          if (cancelled) return;
          // Timeline keys are Athens wall time encoded as UTC: the UTC getters
          // read the Athens hour and date directly.
          const w = athensWallTime(win.dayStartMs + 3600_000);
          const line: (number | null)[] = Array.from({ length: 24 }, () => null);
          for (const p of body.timeline) {
            const d = new Date(p.t);
            if (d.getUTCFullYear() !== w.year || d.getUTCMonth() !== w.month || d.getUTCDate() !== w.day) continue;
            line[d.getUTCHours()] = p.laeq;
          }
          setDayLine({ key: dayKey, value: line });
        })
        .catch(() => {});
    load();
    if (!live) return () => {
      cancelled = true;
    };
    const timer = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sensorId, dayKey, win.dayStartMs, live]);

  const d = detail?.id === sensorId ? detail.value : null;
  const latest = d?.latestReading ?? null;
  const { ageS, tone } = liveStatus(latest?.receivedAt ?? null, nowMs);
  const liveTone = LIVE_TONE_COLOR[tone];
  const stops = typeof window !== "undefined" ? paletteStops() : undefined;

  const hours = profile?.key === dayKey ? profile.value.hours : null;
  const line = dayLine?.key === dayKey ? dayLine.value : null;
  // The band for the cursor's hour: the shell's (fleet) answer first, else
  // the profile's — identical numbers, the profile just arrives later.
  // undefined = still unknown, null = known to be missing.
  let band: UsualBand | null | undefined = usualBand;
  if (band === undefined && hours) band = hours[win.hour] ?? null;
  // Scrubbed within today is still «σήμερα»; only another day is «εκείνη».
  const isToday = usualWindow(nowMs).dayStartMs === win.dayStartMs;
  const wall = athensWallTime(cursorMs);
  const nowFraction = wall.hour + ((cursorMs / 60_000) % 60) / 60;

  const verdictLine = (() => {
    if (level == null) return null;
    if (band === undefined) return { text: tr.now.loading, color: "var(--muted-foreground)" };
    if (!hasSupport(band)) return { text: tr.usual.noHistory, color: "var(--muted-foreground)" };
    const verdict = classify(level, band);
    const delta = usualDelta(level, band);
    if (verdict === "above") return { text: tr.usual.above(delta), color: "var(--sw-level-loud)" };
    if (verdict === "below") return { text: tr.usual.below(-delta), color: "var(--sw-slate)" };
    return { text: tr.usual.inside, color: "var(--sw-slate)" };
  })();
  const edges = hasSupport(band) ? usualEdges(band) : null;

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-8.5rem)] w-[18.5rem] flex-col rounded-xl border bg-card/95 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm max-md:inset-x-2 max-md:right-16 max-md:top-auto max-md:bottom-16 max-md:max-h-[55%] max-md:w-auto">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{d?.name ?? d?.address ?? "…"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{d?.address ?? (d ? `#${d.id.slice(0, 8)}` : "")}</div>
        </div>
        <Button variant="ghost" size="icon" className="-mr-1.5 -mt-1 size-7 shrink-0 max-md:-mr-2.5 max-md:-mt-2.5 max-md:size-11" onClick={onClose} aria-label={tr.pane.close}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* the level — the SAME figure as the circle — then the sentence */}
        {level != null ? (
          <div className="flex items-baseline gap-2">
            <span
              className="text-[34px] font-bold leading-none tabular-nums tracking-tight"
              style={{ color: levelColor(level, stops) }}
            >
              {fmtDb(level)}
            </span>
            <span className="text-[11px] font-medium leading-tight text-muted-foreground">
              dB {tr.aggregations.laeq.label} (LAeq)
              <br />
              {tr.pane.liveWindow(windowS)}
            </span>
          </div>
        ) : (
          <div className="text-[13px] text-muted-foreground">{tr.pane.noData}</div>
        )}
        {verdictLine && (
          <div className="mt-1.5">
            <div className="text-[14px] font-bold leading-tight" style={{ color: verdictLine.color }}>
              {verdictLine.text}
            </div>
            {edges && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {tr.usual.forMoment(whenFmt.format(cursorMs), String(Math.round(edges.lo)), String(Math.round(edges.hi)))}
              </div>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", tone === "live" && "animate-pulse")}
            style={{ backgroundColor: liveTone }}
          />
          {/* The age is rounded and marked approximate; the exact arrival
              time is one hover away. */}
          <span title={fmtExactTime(latest?.receivedAt)}>
            {ageS != null ? tr.pane.lastReading(fmtAgo(ageS)) : tr.pane.noData}
          </span>
          <span className="flex-1" />
          {latest?.battery != null && (
            <span className="flex items-center gap-0.5 tabular-nums">
              <BatteryMedium className="size-3.5 opacity-60" />
              {Math.round(latest.battery)}%
            </span>
          )}
          {latest?.rssi != null && (
            <span className="flex items-center gap-0.5 tabular-nums">
              <Wifi className="size-3 opacity-60" />
              {Math.round(latest.rssi)}
            </span>
          )}
        </div>

        {/* the day against the usual */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {isToday ? tr.usual.chartTitle : tr.usual.chartTitlePast}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">dB</span>
          </div>
          {hours && line ? (
            Object.keys(hours).length > 0 ? (
              <>
                <UsualChart profile={hours} day={line} nowFraction={nowFraction} nowLevel={level} />
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-3 rounded-[1px] bg-sound/30" />
                    {tr.usual.legendBand}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 border-t border-dashed border-sound" />
                    {tr.usual.legendMedian}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 border-t-2 border-ink" />
                    {isToday ? tr.usual.legendToday : tr.usual.legendThatDay}
                  </span>
                </div>
              </>
            ) : (
              <div className="grid h-24 place-items-center rounded-md bg-secondary px-4 text-center text-[11px] text-muted-foreground">
                {tr.usual.noProfile}
              </div>
            )
          ) : (
            <div className="h-24 animate-pulse rounded-md bg-silver/30" />
          )}
        </div>

        {/* the map jump: a real button, not an icon to hunt for */}
        {onGoToMap && (
          <button
            type="button"
            disabled={d?.latitude == null || d?.longitude == null}
            onClick={() => d?.latitude != null && d?.longitude != null && onGoToMap(d.longitude, d.latitude)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-sound/40 py-1.5 text-[12px] font-medium text-sound transition-colors hover:bg-sound/10 disabled:opacity-35"
          >
            <MapPin className="size-3.5" />
            {tr.pane.goToMap}
          </button>
        )}
      </div>
    </div>
  );
}

// Owns its own 5s clock; parent ticks must not re-render it.
export default memo(SensorPane);

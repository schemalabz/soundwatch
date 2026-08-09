"use client";

// The sensor inspector: opens from a circle click. Identity, the current
// level big and colored, liveness + telemetry on one line, and the SAME
// TimelineChart the charts view uses — scoped to this sensor's last 24
// hours through /api/series?sensor= (one chart component, one data path,
// envelope and hover included).
//
// The hero number is the trailing 5-minute energy mean from /api/frames —
// the EXACT value the sensor's map circle shows in live mode. A single
// latest reading can sit several dB away from the 5-minute energy mean
// (one loud burst dominates it), and showing both unlabeled read as a bug.

import { memo, useEffect, useMemo, useState } from "react";
import { BatteryMedium, MapPin, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb } from "@/lib/dashboard/format";
import { quantizeFrameMs, type FrameData } from "@/lib/dashboard/frames";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import TimelineChart from "./charts/TimelineChart";
import type { SeriesResponse } from "./charts/types";

interface SensorDetail {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  latestReading: {
    recordedAt: string;
    laeq: number | null;
    battery: number | null;
    rssi: number | null;
  } | null;
}

const DAY_MS = 24 * 3600_000;

function SensorPane({
  sensorId,
  onClose,
  onGoToMap,
}: {
  sensorId: string;
  onClose: () => void;
  /** Present outside the map view: jump to the map and fly to this sensor. */
  onGoToMap?: (lng: number, lat: number) => void;
}) {
  // Payloads are tagged with the sensor they belong to; switching sensors
  // makes them stale by derivation (no state resets inside effects).
  const [loaded, setLoaded] = useState<{
    id: string;
    detail: SensorDetail;
    series: SeriesResponse;
    liveLaeq: number | null;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const detail = loaded?.id === sensorId ? loaded.detail : null;
  const series = loaded?.id === sensorId ? loaded.series : null;
  const liveLaeq = loaded?.id === sensorId ? loaded.liveLaeq : null;

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const frameAt = quantizeFrameMs(Date.now());
    Promise.all([
      fetch(`/api/sensors/${sensorId}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/series?from=${Date.now() - DAY_MS}&bucket=hour&sensor=${sensorId}`, { cache: "no-store" }).then((r) =>
        r.json()
      ),
      // The same 5-minute live frame the map circles render.
      fetch(`/api/frames?at=${frameAt}&window=300&metric=laeq`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([d, s, f]: [SensorDetail, SeriesResponse, { frames: Record<string, FrameData> }]) => {
        if (cancelled) return;
        const frame = f.frames?.[String(frameAt)] ?? {};
        setLoaded({ id: sensorId, detail: d, series: s, liveLaeq: frame[sensorId]?.laeq ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sensorId]);

  const latest = detail?.latestReading ?? null;
  const ageS = latest ? Math.max(0, Math.round((nowMs - new Date(latest.recordedAt).getTime()) / 1000)) : null;
  const liveTone =
    ageS == null ? "var(--sw-silver)" : ageS < 120 ? "var(--sw-ok)" : ageS < 3600 ? "var(--sw-slate)" : "var(--sw-loud)";
  const heroLaeq = liveLaeq ?? latest?.laeq ?? null;

  // 24h stats straight from the hourly buckets: exact energy mean, the
  // quietest hour's LAeq, and the loudest recorded instant (a true Lmax).
  const stats = useMemo(() => {
    const pts = series?.timeline ?? [];
    if (pts.length === 0) return null;
    const energy = pts.reduce((a, p) => a + Math.pow(10, p.laeq / 10) * p.n, 0);
    const n = pts.reduce((a, p) => a + p.n, 0);
    return {
      avg: 10 * Math.log10(energy / n),
      min: Math.min(...pts.map((p) => p.laeq)),
      max: Math.max(...pts.map((p) => p.lmax)),
    };
  }, [series]);

  const ago = (s: number): string => (s < 90 ? `${s}δ` : s < 5400 ? `${Math.round(s / 60)}λ` : `${(s / 3600).toFixed(1)}ω`);
  const stops = typeof window !== "undefined" ? paletteStops() : undefined;

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-8.5rem)] w-[18.5rem] flex-col rounded-xl border bg-card/95 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm max-md:inset-x-2 max-md:right-2 max-md:top-auto max-md:bottom-24 max-md:max-h-[48%] max-md:w-auto">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{detail?.name ?? "…"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{detail?.address ?? detail?.deviceId ?? ""}</div>
        </div>
        <Button variant="ghost" size="icon" className="-mr-1.5 -mt-1 size-7 shrink-0" onClick={onClose} aria-label={tr.pane.close}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* the level now — the SAME 5-minute figure as the map circle */}
        {heroLaeq != null && (
          <div className="flex items-baseline gap-2">
            <span
              className="text-[34px] font-bold leading-none tabular-nums tracking-tight"
              style={{ color: levelColor(heroLaeq, stops) }}
            >
              {fmtDb(heroLaeq)}
            </span>
            <span className="text-[11px] font-medium leading-tight text-muted-foreground">
              dB LAeq
              <br />
              {tr.pane.liveWindow}
            </span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", ageS != null && ageS < 120 && "animate-pulse")}
            style={{ backgroundColor: liveTone }}
          />
          <span>{ageS != null ? tr.pane.lastReading(ago(ageS)) : tr.pane.noData}</span>
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

        {/* last 24h: the unified timeline chart, sensor-scoped */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {tr.pane.last24h}
            </span>
            {stats && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Math.round(stats.min)}–{Math.round(stats.max)} dB
              </span>
            )}
          </div>
          {series && series.timeline.length > 0 ? (
            <TimelineChart points={series.timeline} metric="laeq" bucket="hour" height={110} compact />
          ) : (
            <div className="grid h-24 place-items-center rounded-md bg-secondary text-[11px] text-muted-foreground">
              {series ? tr.pane.noData : "…"}
            </div>
          )}
        </div>

        {/* 24h stats: one quiet line, no boxes */}
        {stats && (
          <div className="mt-2 flex items-baseline gap-4 border-t pt-2.5 text-[11px] text-muted-foreground">
            {(
              [
                [tr.pane.statAvg, stats.avg],
                [tr.pane.statMin, stats.min],
                [tr.pane.statMax, stats.max],
              ] as const
            ).map(([label, v]) => (
              <span key={label} className="flex items-baseline gap-1">
                {label.toLowerCase()}
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: levelColor(v, stops) }}>
                  {fmtDb(v)}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* the map jump: a real button, not an icon to hunt for */}
        {onGoToMap && (
          <button
            type="button"
            disabled={detail?.latitude == null || detail?.longitude == null}
            onClick={() =>
              detail?.latitude != null && detail?.longitude != null && onGoToMap(detail.longitude, detail.latitude)
            }
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

"use client";

// The sensor inspector: opens from a circle click. Identity, liveness (dot +
// last-reading age + battery/wifi), the current level big and colored, and a
// hand-rolled 24h LAeq sparkline — no chart library, one SVG path.

import { memo, useEffect, useMemo, useState } from "react";
import { BatteryMedium, MapPin, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
import { fmtDb } from "@/lib/dashboard/format";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";

interface SensorDetail {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
}

interface ReadingPoint {
  recordedAt: string;
  laeq: number | null;
  battery: number | null;
  rssi: number | null;
}

const NO_READINGS: ReadingPoint[] = [];

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
  // The payload is tagged with the sensor it belongs to; switching sensors
  // makes it stale by derivation (no state reset inside the effect).
  const [loaded, setLoaded] = useState<{ id: string; detail: SensorDetail; readings: ReadingPoint[] } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const detail = loaded?.id === sensorId ? loaded.detail : null;
  const readings = loaded?.id === sensorId ? loaded.readings : NO_READINGS;

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const from = new Date(Date.now() - 24 * 3600_000).toISOString();
    Promise.all([
      fetch(`/api/sensors/${sensorId}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/sensors/${sensorId}/readings?from=${from}&limit=1500`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([d, r]: [SensorDetail, { readings: ReadingPoint[] }]) => {
        if (cancelled) return;
        // oldest -> newest
        setLoaded({ id: sensorId, detail: d, readings: (r.readings ?? []).slice().reverse() });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sensorId]);

  const latest = readings.length > 0 ? readings[readings.length - 1] : null;
  const ageS = latest ? Math.max(0, Math.round((nowMs - new Date(latest.recordedAt).getTime()) / 1000)) : null;
  const liveTone =
    ageS == null ? "var(--sw-silver)" : ageS < 120 ? "var(--sw-ok)" : ageS < 3600 ? "var(--sw-slate)" : "var(--sw-loud)";

  const levels = useMemo(() => readings.map((r) => r.laeq).filter((v): v is number => v != null), [readings]);
  const stats = useMemo(() => {
    if (levels.length === 0) return null;
    const energyAvg = 10 * Math.log10(levels.reduce((a, v) => a + Math.pow(10, v / 10), 0) / levels.length);
    return { avg: energyAvg, min: Math.min(...levels), max: Math.max(...levels) };
  }, [levels]);

  // Downsample to ~140 columns; the line's stroke is a gradient through the
  // level ramp (same language as the map circles and the timeline chart).
  const spark = useMemo(() => {
    if (levels.length < 2 || !stats) return null;
    const cols = Math.min(140, levels.length);
    const per = levels.length / cols;
    const ys: number[] = [];
    for (let c = 0; c < cols; c++) {
      const slice = levels.slice(Math.floor(c * per), Math.max(Math.floor(c * per) + 1, Math.floor((c + 1) * per)));
      ys.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    const lo = stats.min - 1;
    const hi = stats.max + 1;
    const px = (i: number) => (i / (cols - 1)) * 100;
    const py = (y: number) => 34 - ((y - lo) / Math.max(1, hi - lo)) * 30;
    const pts = ys.map((y, i) => `${px(i).toFixed(2)},${py(y).toFixed(2)}`);
    return {
      line: `M${pts.join("L")}`,
      area: `M${pts.join("L")}L100,36L0,36Z`,
      stops: ys.map((y, i) => ({ offset: i / (cols - 1), value: y })),
    };
  }, [levels, stats]);

  const ago = (s: number): string => (s < 90 ? `${s}δ` : s < 5400 ? `${Math.round(s / 60)}λ` : `${(s / 3600).toFixed(1)}ω`);
  const stops = typeof window !== "undefined" ? paletteStops() : undefined;

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-8.5rem)] w-[18.5rem] flex-col rounded-xl border bg-card/95 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm max-md:inset-x-2 max-md:right-2 max-md:top-auto max-md:bottom-24 max-md:max-h-[48%] max-md:w-auto">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{detail?.name ?? "…"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{detail?.address ?? detail?.deviceId ?? ""}</div>
        </div>
        <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
          {onGoToMap && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-sound hover:text-sound"
              disabled={detail?.latitude == null || detail?.longitude == null}
              onClick={() => detail?.latitude != null && detail?.longitude != null && onGoToMap(detail.longitude, detail.latitude)}
              aria-label={tr.pane.goToMap}
              title={tr.pane.goToMap}
            >
              <MapPin className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={tr.pane.close}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* the level now, with liveness + telemetry on one quiet line */}
        {latest?.laeq != null && (
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight" style={{ color: levelColor(latest.laeq, stops) }}>
              {fmtDb(latest.laeq)}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">dB LAeq</span>
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

        {/* 24h sparkline: gradient line over a soft fill */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tr.pane.last24h}</span>
            {stats && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Math.round(stats.min)}–{Math.round(stats.max)} dB
              </span>
            )}
          </div>
          {spark ? (
            <>
              <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-24 w-full">
                <defs>
                  <linearGradient id="sw-pane-line" x1="0" x2="100" y1="0" y2="0" gradientUnits="userSpaceOnUse">
                    {spark.stops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={levelColor(s.value, stops)} />
                    ))}
                  </linearGradient>
                  <linearGradient id="sw-pane-fill" x1="0" x2="0" y1="0" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0" style={{ stopColor: "var(--sw-silver)", stopOpacity: 0.35 }} />
                    <stop offset="1" style={{ stopColor: "var(--sw-silver)", stopOpacity: 0.05 }} />
                  </linearGradient>
                </defs>
                <path d={spark.area} fill="url(#sw-pane-fill)" />
                <path d={spark.line} fill="none" stroke="url(#sw-pane-line)" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground/70">
                <span>{tr.pane.dayAgo}</span>
                <span>{tr.pane.now}</span>
              </div>
            </>
          ) : (
            <div className="grid h-24 place-items-center rounded-md bg-secondary text-[11px] text-muted-foreground">
              {tr.pane.noData}
            </div>
          )}
        </div>

        {/* 24h stats: one quiet line, no boxes */}
        {stats && (
          <div className="mt-3 flex items-baseline gap-4 border-t pt-2.5 pb-1 text-[11px] text-muted-foreground">
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
      </div>
    </div>
  );
}

// Owns its own 5s clock; parent ticks must not re-render it.
export default memo(SensorPane);

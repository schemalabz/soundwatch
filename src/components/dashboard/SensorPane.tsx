"use client";

// The sensor inspector: opens from a circle click. Identity, liveness (dot +
// last-reading age + battery/wifi), the current level big and colored, and a
// hand-rolled 24h LAeq sparkline — no chart library, one SVG path.

import { useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { levelColor, paletteStops } from "@/lib/dashboard/levels";
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

export default function SensorPane({
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
  const liveTone = ageS == null ? "bg-silver" : ageS < 120 ? "bg-sound" : ageS < 3600 ? "bg-slate" : "bg-silver";

  const levels = useMemo(() => readings.map((r) => r.laeq).filter((v): v is number => v != null), [readings]);
  const stats = useMemo(() => {
    if (levels.length === 0) return null;
    const energyAvg = 10 * Math.log10(levels.reduce((a, v) => a + Math.pow(10, v / 10), 0) / levels.length);
    return { avg: energyAvg, min: Math.min(...levels), max: Math.max(...levels) };
  }, [levels]);

  // Downsample to ~140 columns for a clean path.
  const path = useMemo(() => {
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
    const pts = ys.map((y, i) => {
      const px = (i / (cols - 1)) * 100;
      const py = 34 - ((y - lo) / Math.max(1, hi - lo)) * 32;
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    });
    return `M${pts.join("L")}`;
  }, [levels, stats]);

  const ago = (s: number): string => (s < 90 ? `${s}δ` : s < 5400 ? `${Math.round(s / 60)}λ` : `${(s / 3600).toFixed(1)}ω`);
  const stops = typeof window !== "undefined" ? paletteStops() : undefined;

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-8.5rem)] w-[18.5rem] flex-col rounded-xl border bg-card/95 shadow-[0_2px_16px_-4px_rgb(45_49_66/0.18)] backdrop-blur-sm max-md:inset-x-2 max-md:right-2 max-md:top-auto max-md:bottom-24 max-md:max-h-[48%] max-md:w-auto">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{detail?.name ?? "…"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {detail?.deviceId}
            {detail?.address ? ` · ${detail.address}` : ""}
          </div>
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
        {/* liveness */}
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className={cn("size-2 rounded-full", liveTone, ageS != null && ageS < 120 && "animate-pulse")} />
          {ageS != null ? tr.pane.lastReading(ago(ageS)) : tr.pane.noData}
          {latest?.battery != null && <span className="tabular-nums">· {Math.round(latest.battery)}%</span>}
          {latest?.rssi != null && <span className="tabular-nums">· {Math.round(latest.rssi)} dBm</span>}
        </div>

        {/* current level */}
        {latest?.laeq != null && (
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: levelColor(latest.laeq, stops) }}>
              {latest.laeq.toFixed(1)}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">dB LAeq</span>
          </div>
        )}

        {/* 24h sparkline */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tr.pane.last24h}</span>
            {stats && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Math.round(stats.min)}–{Math.round(stats.max)} dB
              </span>
            )}
          </div>
          {path ? (
            <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-24 w-full">
              <path d={path} fill="none" stroke="var(--sw-slate)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            </svg>
          ) : (
            <div className="grid h-24 place-items-center rounded-md bg-secondary text-[11px] text-muted-foreground">
              {tr.pane.noData}
            </div>
          )}
        </div>

        {/* 24h stats */}
        {stats && (
          <div className="mt-3 grid grid-cols-3 gap-2 pb-1">
            {(
              [
                [tr.pane.statAvg, stats.avg],
                [tr.pane.statMin, stats.min],
                [tr.pane.statMax, stats.max],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-md bg-secondary px-2 py-1.5">
                <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="text-[13px] font-semibold tabular-nums" style={{ color: levelColor(v, stops) }}>
                  {v.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

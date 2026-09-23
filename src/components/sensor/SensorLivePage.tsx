"use client";

// The per-sensor live page. One interval every 5 s (the install page's
// cadence) drives everything: the whole window once, then only the newest 20
// rows merged by recordedAt (the readings key), plus a detail refresh on the
// same tick. The window itself is arrival time:
// the fetch asks for receivedFrom and the merge trims on receivedAt, the same
// clock that orders the rows and ages them. Liveness, cadence and the clock
// offset are derived in src/lib/sensor/live.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BatteryMedium, CircleHelp, Wifi } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ApiReading, ApiSensorDetail } from "@/lib/api/schemas";
import { fmtAgo, fmtDb, fmtDurationS, fmtExactTime } from "@/lib/dashboard/format";
import { liveStatus, LIVE_TONE_COLOR } from "@/lib/dashboard/liveness";
import { downloadCsv, fetchDetail, fetchReadings } from "@/lib/sensor/api";
import { clockOffsetS, mergeReadings, observedCadenceS, spectrumScale, trimToWindow } from "@/lib/sensor/live";
import { sensorStrings as tr } from "@/lib/strings/sensor";
import HelpLabel from "./HelpLabel";
import IntervalCard from "./IntervalCard";
import IntervalLog, { type WindowHours } from "./IntervalLog";
import ReadingGuide from "./ReadingGuide";
import SpectrumCard from "./SpectrumCard";

const POLL_MS = 5000;
const POLL_LIMIT = 20;
const WINDOW_LIMIT = 10000;
const CLOCK_NOTE_FROM_S = 30;

export default function SensorLivePage({ id, shareKey }: { id: string; shareKey: string | null }) {
  const [detail, setDetail] = useState<ApiSensorDetail | null | undefined>(undefined); // undefined = loading, null = 404
  const [readings, setReadings] = useState<ApiReading[]>([]);
  const [windowHours, setWindowHours] = useState<WindowHours>(3);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [csvBusy, setCsvBusy] = useState(false);
  // nowMs (not Date.now()) here: the ref's initial value must come from a
  // pure render — the eslint react-hooks/purity rule flags a bare Date.now()
  // call during render. The effect below re-derives the true value anyway.
  const windowStartRef = useRef<number>(nowMs - windowHours * 3600_000);

  // Wall clock for the "πριν Nδ" line.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Only the 404 outcome matters to this effect. Depending on the detail
  // OBJECT would re-run it (a second 10,000-row fetch) when the detail
  // resolves from loading to loaded.
  const notFound = detail === null;

  // One polling mechanism for the whole page, the one the rest of the site
  // uses (/install/[token], the dashboard's SensorPane, /status): an interval
  // with a `cancelled` flag, failures swallowed, because the next tick IS the
  // retry. Detail and the full window go out together on mount; after that
  // every tick tops the readings up and refreshes detail — one row plus its
  // latest reading, cheap. Refreshing it is not just tidiness:
  // detail.latestReading is the fallback the header and hero use when the
  // window is empty, so keeping it fresh keeps "last seen" honest.
  //
  // Not extracted into a shared hook: there would be exactly one consumer
  // today. If a fourth screen needs this, the four should share a hook.
  useEffect(() => {
    if (notFound) return;
    let cancelled = false;
    // Until the window has landed once, the tick retries it instead of
    // topping up — a top-up alone would leave the log at 20 rows.
    let windowLoaded = false;
    windowStartRef.current = Date.now() - windowHours * 3600_000;
    // fetchDetail resolves null only on a real 404 — that is the page's
    // answer, and flipping notFound stops this effect. A THROWN error
    // (network blip, 5xx) leaves the previous detail in place for the next
    // tick to recover, rather than rendering "not found" for a hiccup.
    const loadDetail = () =>
      fetchDetail(id, shareKey)
        .then((d) => !cancelled && setDetail(d))
        .catch(() => {});
    const loadWindow = () =>
      fetchReadings(id, shareKey, { receivedFromMs: windowStartRef.current, limit: WINDOW_LIMIT })
        .then((r) => {
          if (cancelled) return;
          windowLoaded = true;
          setReadings(r.readings);
        })
        .catch(() => {});
    const topUp = () =>
      fetchReadings(id, shareKey, { limit: POLL_LIMIT })
        .then((r) => {
          if (cancelled) return;
          windowStartRef.current = Date.now() - windowHours * 3600_000;
          setReadings((prev) => trimToWindow(mergeReadings(prev, r.readings), windowStartRef.current));
        })
        .catch(() => {});
    loadDetail();
    loadWindow();
    const t = setInterval(() => {
      loadDetail();
      if (windowLoaded) topUp();
      else loadWindow();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, shareKey, windowHours, notFound]);

  // `latest` is the newest row IN THE WINDOW; `newest` is the sensor's newest
  // row full stop. An empty window (a sensor that last reported before it
  // began) says nothing about whether the sensor has ever reported, so the
  // header, the hero and the spectrum fall back to detail.latestReading.
  // Only the log stays strictly window-scoped.
  const latest = readings[0] ?? null;
  const newest = readings[0] ?? detail?.latestReading ?? null;
  const focused = useMemo(
    () => (focusKey ? readings.find((r) => r.recordedAt === focusKey) ?? newest : newest),
    [focusKey, readings, newest]
  );
  // Live means: the hero is the newest row of the window we are looking at.
  // A fallback reading (or a focused older one) is not live.
  const isLive = latest != null && focused === latest;
  const outsideWindow = focused != null && !readings.some((r) => r.recordedAt === focused.recordedAt);
  const status = liveStatus(newest?.receivedAt ?? null, nowMs);
  // Cadence stays on the window: an empty window has no measurable cadence and
  // legitimately falls back to the configured interval.
  const cadenceS = observedCadenceS(readings, detail?.readingIntervalS ?? 60);
  const offsetS = newest ? clockOffsetS(newest) : 0;
  const spectrumSource = useMemo(
    () => (readings.length > 0 ? readings : newest ? [newest] : []),
    [readings, newest]
  );
  const scale = useMemo(() => spectrumScale(spectrumSource), [spectrumSource]);
  const hasAnyBands = useMemo(() => spectrumSource.some((r) => r.bandsDb != null), [spectrumSource]);

  const onWindowChange = useCallback((h: WindowHours) => {
    setFocusKey(null);
    setWindowHours(h);
  }, []);

  const onCsv = useCallback(async () => {
    setCsvBusy(true);
    try {
      await downloadCsv(id, shareKey, windowStartRef.current);
    } catch {
      /* the button simply re-enables; the log is still on screen */
    } finally {
      setCsvBusy(false);
    }
  }, [id, shareKey]);

  if (detail === null) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-16 text-sm text-muted-foreground">{tr.notFound}</div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
          {/* top bar, as on /status */}
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-3.5" /> {tr.backToMap}
            </Link>
            <div className="text-[13px] font-bold tracking-tight">
              soundwatch<span className="text-sound">.</span>
            </div>
          </div>

          {/* identity */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-bold tracking-tight">{detail?.name ?? (detail ? `#${detail.id.slice(0, 8)}` : tr.loading)}</h1>
              {detail?.isExperimental && (
                <span className="rounded-md bg-secondary px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {tr.benchBadge}
                </span>
              )}
              {detail?.address && <span className="text-[12px] text-muted-foreground">{detail.address}</span>}
              {newest && (
                <span className="ml-auto flex items-center gap-3 text-[12px] tabular-nums text-muted-foreground">
                  {newest.battery != null && (
                    <span className="flex items-center gap-1"><BatteryMedium className="size-3.5 opacity-60" />{Math.round(newest.battery)}%</span>
                  )}
                  {newest.rssi != null && (
                    <span className="flex items-center gap-1"><Wifi className="size-3 opacity-60" />{Math.round(newest.rssi)}</span>
                  )}
                  {newest.temperature != null && <span>{fmtDb(newest.temperature)} °C</span>}
                  {newest.humidity != null && <span>{Math.round(newest.humidity)} %</span>}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className={cn("size-2 rounded-full", status.tone === "live" && "animate-pulse")} style={{ backgroundColor: LIVE_TONE_COLOR[status.tone] }} />
                {status.tone === "never" ? (
                  <span>{tr.live.never}</span>
                ) : (
                  <span>
                    {status.tone === "live" ? tr.live.live : status.tone === "dead" ? tr.live.dead : tr.live.stale} · {tr.live.lastReading}
                    {/* The age is rounded and marked approximate; the exact
                        arrival time is one hover away. */}
                    <b
                      className="tabular-nums text-foreground"
                      title={fmtExactTime(newest?.receivedAt)}
                    >
                      {fmtAgo(status.ageS ?? 0)}
                    </b>
                    {status.tone !== "live" && <> — {tr.live.staleHint}</>}
                  </span>
                )}
              </span>
              {newest && <span>{tr.live.cadence(cadenceS)}</span>}
              {newest && Math.abs(offsetS) >= CLOCK_NOTE_FROM_S && (
                <HelpLabel entry="clocks">
                  {offsetS > 0 ? tr.live.clockAhead(fmtDurationS(offsetS)) : tr.live.clockBehind(fmtDurationS(offsetS))}
                </HelpLabel>
              )}
              <a href="#guide" className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                <CircleHelp className="size-3.5" /> {tr.live.guideLink}
              </a>
            </div>
          </div>

          {/* interval in focus + spectrum */}
          {focused && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <IntervalCard reading={focused} isLive={isLive} outsideWindow={outsideWindow} onBackToLive={() => setFocusKey(null)} />
              <SpectrumCard reading={focused} isLive={isLive} scale={scale} hasAnyBands={hasAnyBands} />
            </div>
          )}

          <IntervalLog
            readings={readings}
            focusKey={isLive ? null : focusKey}
            onFocus={setFocusKey}
            windowHours={windowHours}
            onWindowChange={onWindowChange}
            cadenceS={cadenceS}
            pollS={POLL_MS / 1000}
            onCsv={onCsv}
            csvBusy={csvBusy}
          />

          <ReadingGuide />
        </div>
      </div>
    </TooltipProvider>
  );
}

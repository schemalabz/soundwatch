"use client";

// The period lens on a phone: the map fills the screen and the ranking,
// comparison and charts ride in a sheet pulled up from the bottom — the maps
// app pattern. Three stops: a peek (the header only, the map nearly whole),
// half (the default: map above, ranking below) and full (the sheet up to the
// lens switcher, its content scrolling).
//
// It replaced a scroller laid over the map with a see-through cutout, which
// suits a mouse but not a finger: iOS Safari would not scroll it at all, and
// elsewhere a swipe on the cutout moved the map, not the page.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";

// The sheet never rises past this much of the map: the filters button and the
// lens switcher at the map's top stay in reach.
const TOP_GAP_PX = 72;
// The peek shows the sheet's head and nothing else, so it is as tall as the
// head turns out to be (its text wraps differently per phone). Until measured:
const HEAD_FALLBACK_PX = 112;
/** Share of the map the sheet covers at its default stop. The map fit reads
 *  it too (DashboardShell's viewPadding), to keep the places clear of it. */
export const PERIOD_SHEET_HALF_SHARE = 0.54;
const PEEK = 0;
const HALF = 1;
const FULL = 2;

export default function PeriodSheet({
  header,
  children,
  selectedId,
  placingPin,
}: {
  /** What the map above shows, said once at the sheet's head. */
  header: ReactNode;
  children: ReactNode;
  /** A place was opened: the sheet rises so its detail has room. */
  selectedId: string | null;
  /** A pin is being placed: the sheet gets out of the map's way. */
  placingPin: boolean;
}) {
  const [stop, setStop] = useState(HALF);
  // React to the two outside events while rendering (not in an effect): the
  // stop is state, and these are the moments it must change by itself.
  const [seen, setSeen] = useState({ selectedId, placingPin, stopBeforePin: HALF });
  if (seen.selectedId !== selectedId || seen.placingPin !== placingPin) {
    setSeen({ selectedId, placingPin, stopBeforePin: placingPin && !seen.placingPin ? stop : seen.stopBeforePin });
    if (placingPin && !seen.placingPin) setStop(PEEK);
    // Placed or called off: back to where the sheet was, unless it was moved since.
    else if (!placingPin && seen.placingPin && stop === PEEK) setStop(seen.stopBeforePin);
    else if (selectedId && selectedId !== seen.selectedId) setStop(FULL);
  }

  // The map's box on the screen, read off a marker laid over it: the sheet's
  // stops are shares of the map, and the map does not always start at the
  // screen's top (staging has a banner above it). Elements as state, not
  // refs: the effects must run when they mount, and the sheet is portalled,
  // so its head mounts a tick after this component.
  const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState(() => ({ top: 0, height: window.innerHeight }));
  useEffect(() => {
    if (!mapEl) return;
    const measure = () => {
      const r = mapEl.getBoundingClientRect();
      setMap((prev) => (prev.top === r.top && prev.height === r.height ? prev : { top: r.top, height: r.height }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(mapEl);
    return () => ro.disconnect();
  }, [mapEl]);
  const [headEl, setHeadEl] = useState<HTMLDivElement | null>(null);
  const [headH, setHeadH] = useState(HEAD_FALLBACK_PX);
  useEffect(() => {
    if (!headEl) return;
    // offsetHeight, not the observer's content box: the padding is part of the head.
    const ro = new ResizeObserver(() => setHeadH(headEl.offsetHeight));
    ro.observe(headEl);
    return () => ro.disconnect();
  }, [headEl]);

  const sheetH = Math.max(0, map.height - TOP_GAP_PX);
  // The library measures a stop from the bottom of the SCREEN, and the sheet
  // at rest starts `rest` below the screen's top, so the lower stops (how
  // much of the sheet shows) add that back. The top one must be exactly 1 —
  // the sheet at rest, untranslated: only then does the library hand a swipe
  // inside it to the content's scroll.
  const snapPoints = useMemo(() => {
    const rest = map.top + TOP_GAP_PX;
    return [`${headH + rest}px`, `${Math.round(map.height * PERIOD_SHEET_HALF_SHARE) + rest}px`, 1];
  }, [headH, map]);

  // Below the top stop the content does not scroll, so it must not be left
  // scrolled: the lower stops show the start of the ranking.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stop !== FULL) scrollerRef.current?.scrollTo({ top: 0 });
  }, [stop]);

  return (
    <>
      <div ref={setMapEl} aria-hidden="true" className="pointer-events-none absolute inset-0" />
      <Drawer.Root
        open
        // Not modal: the map behind stays live, to pan, zoom and tap.
        modal={false}
        dismissible={false}
        snapPoints={snapPoints}
        activeSnapPoint={snapPoints[stop]}
        setActiveSnapPoint={(point) => {
          const i = snapPoints.indexOf(point as string | number);
          if (i !== -1) setStop(i);
        }}
      >
        <Drawer.Portal>
          {/* As tall as its top stop at every stop (the rest hangs below the
              screen), so a drag upward brings content with it, not a blank. */}
          <Drawer.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={{ height: sheetH }}
            className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t bg-background shadow-[0_-10px_30px_-14px_rgb(45_49_66/0.32)] outline-none"
          >
            <Drawer.Title className="sr-only">{tr.summary.sheetTitle}</Drawer.Title>
            <div ref={setHeadEl} className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
              <Drawer.Handle aria-label={tr.summary.sheetHandle} className="!h-[5px] !w-10 !bg-silver" />
              <div className="mt-2.5 text-[11.5px] leading-snug">{header}</div>
            </div>
            {/* Scrolls only at the top stop; below it a drag moves the sheet. */}
            <div
              ref={scrollerRef}
              className={cn(
                "min-h-0 flex-1 overscroll-contain border-t pb-[env(safe-area-inset-bottom)] pt-5",
                stop === FULL ? "overflow-y-auto" : "overflow-hidden"
              )}
            >
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

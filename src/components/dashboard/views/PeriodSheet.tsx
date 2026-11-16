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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";

// The sheet never rises past this: the filters button and the lens switcher
// above it stay in reach. Kept in step with the content's height class below.
const TOP_GAP_PX = 72;
// The peek shows the sheet's head and nothing else, so it is as tall as the
// head turns out to be (its text wraps differently per phone). Until measured:
const HEAD_FALLBACK_PX = 112;
/** Share of the screen the sheet takes at its default stop. */
const HALF_SHARE = 0.54;
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
  const [seen, setSeen] = useState({ selectedId, placingPin });
  if (seen.selectedId !== selectedId || seen.placingPin !== placingPin) {
    setSeen({ selectedId, placingPin });
    if (placingPin && !seen.placingPin) setStop(PEEK);
    else if (selectedId && selectedId !== seen.selectedId) setStop(FULL);
  }

  const [screenH, setScreenH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setScreenH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The element as state, not a ref: the sheet is portalled and mounts a
  // tick after this component, so an effect reading a ref would find nothing.
  const [headEl, setHeadEl] = useState<HTMLDivElement | null>(null);
  const [headH, setHeadH] = useState(HEAD_FALLBACK_PX);
  useEffect(() => {
    if (!headEl) return;
    // offsetHeight, not the observer's content box: the padding is part of the head.
    const ro = new ResizeObserver(() => setHeadH(headEl.offsetHeight));
    ro.observe(headEl);
    return () => ro.disconnect();
  }, [headEl]);

  // How much of the sheet is on screen at each stop.
  const visiblePx = useMemo(() => [headH, Math.round(screenH * HALF_SHARE), screenH - TOP_GAP_PX], [headH, screenH]);
  // The library measures a stop from the bottom of the SCREEN, and the sheet
  // is TOP_GAP_PX shorter than the screen, so the lower stops add the gap
  // back. The top one must be exactly 1 — the sheet at rest, untranslated:
  // only then does the library hand a swipe inside it to the content's scroll.
  const snapPoints = useMemo(() => [`${visiblePx[PEEK] + TOP_GAP_PX}px`, `${visiblePx[HALF] + TOP_GAP_PX}px`, 1], [visiblePx]);

  return (
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
        <Drawer.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-30 h-[calc(100dvh-72px)] rounded-t-2xl border-t bg-background shadow-[0_-10px_30px_-14px_rgb(45_49_66/0.32)] outline-none"
        >
          <Drawer.Title className="sr-only">{tr.summary.sheetTitle}</Drawer.Title>
          {/* Sized to the part on screen, so "scroll this row into view" lands
              in what is visible, not in the part parked below the screen. */}
          <div className="flex min-h-0 flex-col" style={{ height: visiblePx[stop] }}>
            <div ref={setHeadEl} className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
              <Drawer.Handle aria-label={tr.summary.sheetHandle} className="!h-[5px] !w-10 !bg-silver" />
              <div className="mt-2.5 text-[11.5px] leading-snug">{header}</div>
            </div>
            {/* Scrolls only at the top stop; below it a drag moves the sheet. */}
            <div
              className={cn(
                "min-h-0 flex-1 overscroll-contain border-t pb-[env(safe-area-inset-bottom)] pt-5",
                stop === FULL ? "overflow-y-auto" : "overflow-hidden",
                // At the peek there is no room for it: keep a sliver of text from showing.
                stop === PEEK && "invisible"
              )}
            >
              {children}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

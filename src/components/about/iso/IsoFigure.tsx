"use client";

// Hosts one iso-glow figure: mounts it into a fresh <svg>, runs its loop
// only while it is on screen, and tears it down cleanly (React may mount
// twice in development). Reduced motion: the figure is simulated for a few
// seconds off-screen and then holds still on that frame.

import { useEffect, useRef } from "react";
import { frame, slits, esc } from "./kernel";
import type { IsoApi, IsoFig } from "./runtime";

const REDUCED_SECONDS = 3.2;

export default function IsoFigure({ fig, aria, hint, freezeAt }: { fig: IsoFig; aria: string; hint: string; /** Simulate to this many seconds and hold (inspection, tests). */ freezeAt?: number }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const svg = svgRef.current, holder = holderRef.current, read = readRef.current;
    if (!svg || !holder || !read) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loops: ((t: number, dt: number) => void)[] = [];
    let lastText = "";
    const api: IsoApi = {
      iso: { frame, slits, esc },
      loop: (fn) => void loops.push(fn),
      readout: (s) => {
        if (s !== lastText) read.textContent = lastText = s;
      },
      power: (on) => holder.classList.toggle("glow", on),
      reduced,
    };
    svg.innerHTML = "";
    const handle = fig.mount(svg, api) || {};

    let t = 0, prev = 0, raf = 0, visible = false;
    const step = (dt: number) => {
      t += dt;
      for (const f of loops) f(t, dt);
    };
    const tick = (now: number) => {
      raf = 0;
      if (!visible) return;
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
      prev = now;
      step(dt);
      raf = requestAnimationFrame(tick);
    };

    let io: IntersectionObserver | null = null;
    if (reduced || freezeAt != null) {
      const until = freezeAt ?? REDUCED_SECONDS;
      for (let i = 0; i < until * 30; i++) step(1 / 30);
    } else {
      step(0);
      io = new IntersectionObserver(
        ([e]) => {
          visible = e.isIntersecting;
          if (visible && !raf) {
            prev = 0;
            raf = requestAnimationFrame(tick);
          }
        },
        { rootMargin: "120px" }
      );
      io.observe(holder);
    }

    const onKey = (e: KeyboardEvent) => {
      if (handle.key?.(e)) e.preventDefault();
    };
    svg.addEventListener("keydown", onKey);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      svg.removeEventListener("keydown", onKey);
      handle.unmount?.();
      svg.innerHTML = "";
    };
  }, [fig, freezeAt]);

  return (
    <>
      <div ref={holderRef} className="stage-holder">
        <svg ref={svgRef} className="stage" role="button" tabIndex={0} aria-label={aria} />
      </div>
      {/* Two single-line cells: the readout changes every frame, so nothing
          here may wrap, or the figure's height would jump with the text. On
          a phone the two stack; wider, they share a row. */}
      <figcaption className="mt-2 grid grid-cols-1 gap-y-0.5 text-[11px] uppercase leading-5 tracking-[0.14em] text-[#9a9aa6] sm:flex sm:items-center sm:justify-between sm:gap-3">
        <span className="truncate whitespace-nowrap">{hint}</span>
        <span
          ref={readRef}
          aria-live="polite"
          className="min-w-0 truncate whitespace-nowrap normal-case tracking-[0.04em] text-[#e8e8ee] tabular-nums sm:flex-1 sm:text-right"
        />
      </figcaption>
    </>
  );
}

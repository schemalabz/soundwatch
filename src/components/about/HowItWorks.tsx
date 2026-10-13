"use client";

// The dark "how it works" section: nine iso-glow figures, one per stage of
// the measurement chain. Each figure lives in ./iso/figs and animates on its
// own clock while it is on screen; this file only lays out text and figure.

import Link from "next/link";
import { aboutStrings as tr, type AboutStage } from "@/lib/strings/about";
import IsoFigure from "./iso/IsoFigure";
import { FIGS } from "./iso/figs";
import "./iso/iso.css";

function Stage({ stage, index }: { stage: AboutStage; index: number }) {
  const flip = index % 2 === 1;
  return (
    <div
      id={`how-${stage.id}`}
      className="grid scroll-mt-6 items-center gap-10 border-t border-[#23232f] py-14 md:grid-cols-2"
    >
      <figure className={`m-0 rounded-2xl border border-[#23232f] bg-[#0b0b15] p-4 ${flip ? "md:order-2" : ""}`}>
        {FIGS[stage.id] && <IsoFigure fig={FIGS[stage.id]} aria={stage.aria} hint={stage.hint} />}
      </figure>
      <div className={`flex flex-col gap-4 ${flip ? "md:order-1" : ""}`}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-sound text-sm font-bold text-sound">
            {index + 1}
          </span>
          <h3 className="m-0 text-[26px] font-bold tracking-tight">{stage.title}</h3>
        </div>
        {stage.body.map((p) => (
          <p key={p.slice(0, 24)} className="m-0 text-base leading-[1.55] text-[#c9c9d4]">
            {p}
          </p>
        ))}
        <div className="flex flex-wrap gap-2">
          {stage.chips.map((c) => (
            <span key={c} className="inline-flex h-[30px] items-center rounded-[7px] border border-[#2d2d3a] px-2.5 text-[12.5px] font-medium tabular-nums text-[#d6d6de]">
              {c}
            </span>
          ))}
          <span className="inline-flex h-[30px] items-center rounded-[7px] border border-sound px-2.5 text-[12.5px] font-medium text-sound">
            {stage.accent}
          </span>
        </div>
        {stage.id === "server" && (
          <div className="flex flex-col gap-2 rounded-xl border border-[#2d2d3a] bg-[#0b0b15] px-[18px] py-4 text-sm leading-[1.5]">
            {tr.how.formulas.rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-3 tabular-nums">
                <span className="min-w-[120px] text-sound">{k}</span>
                <span className="text-[#e4e4ec]">{v}</span>
              </div>
            ))}
          </div>
        )}
        {stage.id === "map" && (
          <Link
            href="/"
            className="mt-1 inline-flex h-11 items-center self-start rounded-[10px] bg-sound px-[18px] text-sm font-bold text-ink no-underline"
          >
            {tr.how.openMap}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how" className="iso bg-ink text-white" style={{ padding: "96px 0 80px" }}>
      {/* the glow filters, once; figures reference them by id */}
      <svg className="fx" aria-hidden="true">
        <defs>
          <filter id="iso-glow" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="iso-soft" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="iso-bloom" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
      </svg>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-6">
        <div className="flex max-w-[760px] flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-sound">{tr.how.kicker}</div>
          <h2 className="m-0 text-[clamp(32px,4.5vw,48px)] font-bold leading-[1.08] tracking-tight text-balance">{tr.how.title}</h2>
          <p className="m-0 max-w-[640px] text-[17px] leading-[1.5] text-[#b9b9c6]">{tr.how.lead}</p>
        </div>
        <nav aria-label={tr.how.kicker} className="flex flex-wrap gap-2">
          {tr.how.stages.map((s, i) => (
            <a
              key={s.id}
              href={`#how-${s.id}`}
              className="inline-flex h-[34px] items-center gap-2 rounded-lg border border-[#2d2d3a] py-0 pl-2 pr-3 text-[13px] text-[#d6d6de] no-underline transition-colors hover:border-sound hover:text-white"
            >
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#1a1a27] text-[11px] font-bold text-sound">{i + 1}</span>
              {s.short}
            </a>
          ))}
        </nav>
        {tr.how.stages.map((s, i) => (
          <Stage key={s.id} stage={s} index={i} />
        ))}
        <a
          href={tr.how.madeWithHref}
          target="_blank"
          rel="noopener"
          className="self-end text-[11px] uppercase tracking-[0.12em] text-[#4a4a56] no-underline transition-colors hover:text-[#9a9aa6]"
        >
          {tr.how.madeWith}
        </a>
      </div>
    </section>
  );
}

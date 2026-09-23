"use client";

// The glossary as ONE accordion: the whole guide is collapsed until asked
// for, by the header link at the top of the page or by clicking the guide's
// own summary. Native <details>/<summary> so keyboard operation, focus
// handling and screen-reader semantics come for free.
//
// Every entry still carries `guide-<key>`, but as a plain anchor rather than
// its own accordion: a dotted HelpLabel opens the one guide and scrolls to
// its term, so a reader lands on the explanation they asked about instead of
// at the top of a long list.

import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

import { GLOSSARY, GLOSSARY_ORDER } from "@/lib/strings/glossary";
import { sensorStrings as tr } from "@/lib/strings/sensor";

/**
 * `decodeURIComponent` throws URIError on a malformed escape, and a fragment
 * is whatever the URL bar holds: `/sensors/<id>#guide%` tore the whole React
 * tree down to "This page couldn't load". The fragment survives a reload, so
 * the page stayed broken for whoever was handed that link — and this page
 * exists to be handed to someone outside as a link. An undecodable fragment
 * is just a fragment that matches no entry; the raw text answers that fine.
 *
 * Exported only so the regression has a test; nothing else calls it.
 */
export function decodeFragment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function ReadingGuide() {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // Only ever opens: a reader who closed it by hand is not fought with.
    const openFor = (id: string) => {
      const details = detailsRef.current;
      if (!details) return;
      details.open = true;

      if (id === "guide") {
        details.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // A specific entry: let the open animation lay the content out before
      // measuring where the term ended up.
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };

    const fromHash = () => {
      const id = decodeFragment(location.hash.slice(1));
      if (id === "guide" || id.startsWith("guide-")) openFor(id);
    };

    // Clicking the same link twice fires no hashchange, so act on the click
    // too; rAF lets the browser finish its own hash navigation first.
    const onClick = (ev: MouseEvent) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href^="#guide"]');
      if (!link) return;
      const id = decodeFragment(link.getAttribute("href")!.slice(1));
      requestAnimationFrame(() => openFor(id));
    };

    fromHash();
    window.addEventListener("hashchange", fromHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details
      ref={detailsRef}
      id="guide"
      className="group scroll-mt-6 rounded-xl border bg-card px-[18px] py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
          {tr.guide.title}
        </h2>
      </summary>

      <dl className="mt-3 grid grid-cols-1 gap-x-7 gap-y-3 border-t pt-3 md:grid-cols-2">
        {GLOSSARY_ORDER.map((key) => {
          const e = GLOSSARY[key];
          return (
            <div key={key} id={`guide-${key}`} className="flex scroll-mt-6 flex-col gap-0.5">
              <dt className="text-[12.5px] font-semibold">
                {e.term}
                {e.code && <span className="ml-1.5 font-normal text-muted-foreground">({e.code})</span>}
              </dt>
              <dd className="m-0 text-[12px] leading-[1.45] text-muted-foreground">{e.long}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

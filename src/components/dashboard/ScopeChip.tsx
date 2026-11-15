"use client";

// The selection, as one recognisable token.
//
// The rail's header says what the period view covers («τους τελευταίους 3
// μήνες, μόνο τις νύχτες») and every section beside it is computed for exactly
// that. Said in grey prose under each heading, nobody connected the two. So
// the selection is drawn as the SAME orange chip in the rail's header and on
// every section it governs, and the chips behave as one thing:
//
//   - change a filter and every chip flashes at once (keyed on its text, so
//     the CSS animation replays): cause on the left, effect on the right;
//   - hover a chip and the rail's header lights up, like MetricMention does
//     for the metric picker;
//   - click one and the header pulses (on a phone, where the rail is a
//     sheet, the sheet opens).
//
// A context instead of props: the chip sits five components deep in three
// different sections, and all of them say the same thing.

import { createContext, useContext, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";

interface ScopeLink {
  text: string;
  onHover?: (on: boolean) => void;
  onClick?: () => void;
}

const ScopeContext = createContext<ScopeLink | null>(null);

export function ScopeProvider({ text, onHover, onClick, children }: ScopeLink & { children: React.ReactNode }) {
  const value = useMemo(() => ({ text, onHover, onClick }), [text, onHover, onClick]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export default function ScopeChip({
  fallback,
  className,
}: {
  /** Plain text for where no rail is linked (outside the period view). */
  fallback?: string;
  className?: string;
}) {
  const scope = useContext(ScopeContext);
  if (!scope) return fallback ? <>{fallback}</> : null;
  return (
    <button
      // Remounts when the selection changes: that replays the flash.
      key={scope.text}
      type="button"
      title={tr.scope.chipHint}
      onMouseEnter={() => scope.onHover?.(true)}
      onMouseLeave={() => scope.onHover?.(false)}
      onClick={scope.onClick}
      // .sw-scope-chip (globals.css) is the colour and the flash, and is what
      // the rail header's own chip shares with this one.
      className={cn(
        "sw-scope-chip inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full px-1.5 py-px align-baseline font-medium text-foreground transition-shadow hover:ring-1 hover:ring-sound",
        className
      )}
    >
      <SlidersHorizontal className="size-2.5 shrink-0 text-sound" />
      <span className="truncate">{scope.text}</span>
    </button>
  );
}

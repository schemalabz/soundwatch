"use client";

// A dotted label that explains itself: hover/focus shows the glossary's
// one-liner, click jumps to the full entry in the reading guide and opens it
// (the guide watches for `#guide-<key>`). Same dotted affordance the dashboard
// uses for MetricMention.

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GLOSSARY, type GlossaryKey } from "@/lib/strings/glossary";

export default function HelpLabel({
  entry,
  children,
  className,
  text,
}: {
  entry: GlossaryKey;
  children: React.ReactNode;
  className?: string;
  /** Overrides GLOSSARY[entry].short, for a caller that has a more specific hint to show. */
  text?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`#guide-${entry}`}
          className={cn(
            "cursor-help border-b border-dotted border-muted-foreground/50 no-underline text-inherit",
            className
          )}
        >
          {children}
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-[11.5px] leading-snug">
        {text ?? GLOSSARY[entry].short}
      </TooltipContent>
    </Tooltip>
  );
}

"use client";

import type { TimeRange } from "@/lib/metrics";

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export default function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1 bg-light rounded-lg p-1">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            value === r.value
              ? "bg-primary text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

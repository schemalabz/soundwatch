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
    <div className="sw-chiptrack">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className="sw-chip"
          data-active={value === r.value}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

"use client";

interface MetricGaugeProps {
  label: string;
  value: number | null;
  /** Display string for the value (already formatted). */
  display: string;
  /** Fraction 0..1 of the gauge sweep. */
  fraction: number;
  color: string;
  statusText?: string | null;
  /** Dot size grows with severity, like the reference. */
  dotSize?: number;
}

const SIZE = 88;
const C = SIZE / 2;
const R = 40;
const TICKS = 44;
// Gauge sweep: 270° from 135° (bottom-left) clockwise to 45° (bottom-right).
const START = 135;
const SWEEP = 270;

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
}

export default function MetricGauge({
  label,
  value,
  display,
  fraction,
  color,
  statusText,
  dotSize = 6,
}: MetricGaugeProps) {
  const f = Math.max(0, Math.min(1, fraction));
  const needleAngle = START + f * SWEEP;
  const tip = polar(needleAngle, R - 6);

  return (
    <div className="flex-1 flex flex-col items-center gap-3.5 py-2.5 min-w-[80px]">
      <div className="self-stretch flex flex-col items-start gap-1.5">
        <span className="font-light text-xs text-ink tracking-[0.6px]">
          {label}
        </span>
        {statusText && (
          <span className="sw-badge">
            <span
              className="rounded-full"
              style={{ width: dotSize, height: dotSize, background: color, transition: "background 300ms" }}
            />
            <span className="sw-badge-label">{statusText}</span>
          </span>
        )}
      </div>

      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
        {Array.from({ length: TICKS + 1 }).map((_, i) => {
          const ang = START + (i / TICKS) * SWEEP;
          const a = polar(ang, R);
          const b = polar(ang, R - 3.5);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--sw-ink)"
              strokeOpacity={0.45}
              strokeWidth={0.6}
              strokeLinecap="round"
            />
          );
        })}
        {value != null && (
          <line
            x1={C}
            y1={C}
            x2={tip.x}
            y2={tip.y}
            stroke="var(--sw-ink)"
            strokeWidth={1.3}
            strokeLinecap="square"
          />
        )}
      </svg>

      <div
        className="font-light text-[32px] leading-none"
        style={{ color: value != null ? color : "var(--sw-muted)", transition: "color 300ms" }}
      >
        {display}
      </div>
    </div>
  );
}

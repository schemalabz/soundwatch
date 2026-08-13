"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { getMetricDef, NOISE_METRIC } from "@/lib/metrics";

interface ReadingsChartProps {
  readings: Record<string, unknown>[];
  metricKey: string;
  height?: number;
}

export default function ReadingsChart({
  readings,
  metricKey,
  height = 300,
}: ReadingsChartProps) {
  const tMetrics = useTranslations("metrics");
  const def = getMetricDef(metricKey) ?? NOISE_METRIC;

  const data = readings
    .filter((r) => r[metricKey] != null)
    .map((r) => ({
      time: new Date(r.recordedAt as string).getTime(),
      value: metricKey === "pressurePa"
        ? (r[metricKey] as number) / 1000
        : (r[metricKey] as number),
    }))
    // Sort on the x value itself rather than assuming the API's order. The
    // readings endpoint orders by received_at (a drifting device clock must
    // not decide which rows are latest), so for a unit whose clock has jumped
    // that order is not the recorded_at order this axis plots.
    .sort((a, b) => a.time - b.time);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted"
        style={{ height }}
      >
        —
      </div>
    );
  }

  const label = tMetrics(`${metricKey}.label`);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d5" />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => format(new Date(t), "HH:mm")}
          fontSize={12}
          stroke="#78716c"
        />
        <YAxis
          fontSize={12}
          unit={` ${def.unit}`}
          stroke="#78716c"
        />
        <Tooltip
          labelFormatter={(t) =>
            format(new Date(t as number), "MMM d, HH:mm:ss")
          }
          formatter={(v) => [
            `${Number(v).toFixed(def.decimals ?? 1)} ${def.unit}`,
            label,
          ]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e7e0d5",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={def.color}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

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
import { useThemeColors } from "@/lib/useThemeColors";

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
  const c = useThemeColors();
  const def = getMetricDef(metricKey) ?? NOISE_METRIC;

  const data = readings
    .filter((r) => r[metricKey] != null)
    .map((r) => ({
      time: new Date(r.recordedAt as string).getTime(),
      value: metricKey === "pressurePa"
        ? (r[metricKey] as number) / 1000
        : (r[metricKey] as number),
    }))
    .reverse();

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
        <CartesianGrid strokeDasharray="3 3" stroke={c.hairline} />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => format(new Date(t), "HH:mm")}
          fontSize={11}
          stroke={c.muted}
          tick={{ fill: c.muted }}
        />
        <YAxis
          fontSize={11}
          unit={` ${def.unit}`}
          stroke={c.muted}
          tick={{ fill: c.muted }}
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
            borderRadius: "4px",
            border: `0.5px solid ${c.hairline}`,
            background: c.panel,
            color: c.ink,
            fontSize: "12px",
          }}
          labelStyle={{ color: c.muted }}
          itemStyle={{ color: c.ink }}
          cursor={{ stroke: c.muted, strokeWidth: 1, strokeDasharray: "3 3" }}
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

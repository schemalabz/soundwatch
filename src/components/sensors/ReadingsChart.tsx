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

interface Reading {
  recordedAt: string;
  noiseDba: number | null;
  temperature: number | null;
  humidity: number | null;
}

interface ReadingsChartProps {
  readings: Reading[];
  metric?: "noiseDba" | "temperature" | "humidity";
}

const METRIC_CONFIG = {
  noiseDba: { label: "Noise (dBA)", color: "#c2410c", unit: "dBA" },
  temperature: { label: "Temperature (°C)", color: "#fb923c", unit: "°C" },
  humidity: { label: "Humidity (%)", color: "#0d9488", unit: "%" },
};

export default function ReadingsChart({
  readings,
  metric = "noiseDba",
}: ReadingsChartProps) {
  const config = METRIC_CONFIG[metric];

  const data = readings
    .filter((r) => r[metric] != null)
    .map((r) => ({
      time: new Date(r.recordedAt).getTime(),
      value: r[metric],
    }))
    .reverse();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d5" />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => format(new Date(t), "HH:mm")}
          fontSize={12}
          stroke="#78716c"
        />
        <YAxis fontSize={12} unit={` ${config.unit}`} stroke="#78716c" />
        <Tooltip
          labelFormatter={(t) => format(new Date(t as number), "MMM d, HH:mm:ss")}
          formatter={(v) => [`${Number(v).toFixed(1)} ${config.unit}`, config.label]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e7e0d5",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={config.color}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

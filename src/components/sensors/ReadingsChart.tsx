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
  noiseDba: { label: "Noise (dBA)", color: "#ef4444", unit: "dBA" },
  temperature: { label: "Temperature (°C)", color: "#f97316", unit: "°C" },
  humidity: { label: "Humidity (%)", color: "#3b82f6", unit: "%" },
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
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => format(new Date(t), "HH:mm")}
          fontSize={12}
        />
        <YAxis fontSize={12} unit={` ${config.unit}`} />
        <Tooltip
          labelFormatter={(t) => format(new Date(t as number), "MMM d, HH:mm:ss")}
          formatter={(v) => [`${Number(v).toFixed(1)} ${config.unit}`, config.label]}
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

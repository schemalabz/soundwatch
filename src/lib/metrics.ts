export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  decimals?: number;
}

export interface MetricGroupDef {
  id: string;
  label: string;
  icon: string;
  summaryMetric: string;
  metrics: MetricDef[];
}

export const METRIC_GROUPS: MetricGroupDef[] = [
  {
    id: "environment",
    label: "Environment",
    icon: "🌡",
    summaryMetric: "temperature",
    metrics: [
      { key: "temperature", label: "Temperature", unit: "°C", color: "#fb923c" },
      { key: "humidity", label: "Humidity", unit: "%", color: "#0d9488" },
      { key: "lightLux", label: "Light", unit: "lux", color: "#eab308", decimals: 0 },
      { key: "pressurePa", label: "Pressure", unit: "kPa", color: "#6366f1", decimals: 2 },
    ],
  },
  {
    id: "airQuality",
    label: "Air Quality",
    icon: "🌫",
    summaryMetric: "pm25",
    metrics: [
      { key: "pm1", label: "PM1", unit: "µg/m³", color: "#f97316" },
      { key: "pm25", label: "PM2.5", unit: "µg/m³", color: "#ef4444" },
      { key: "pm4", label: "PM4", unit: "µg/m³", color: "#dc2626" },
      { key: "pm10", label: "PM10", unit: "µg/m³", color: "#b91c1c" },
    ],
  },
  {
    id: "uv",
    label: "UV Radiation",
    icon: "☀️",
    summaryMetric: "uvA",
    metrics: [
      { key: "uvA", label: "UVA", unit: "µW/cm²", color: "#a855f7" },
      { key: "uvB", label: "UVB", unit: "µW/cm²", color: "#7c3aed" },
      { key: "uvC", label: "UVC", unit: "µW/cm²", color: "#6d28d9" },
    ],
  },
  {
    id: "particleCounts",
    label: "Particle Counts",
    icon: "🔬",
    summaryMetric: "pn25",
    metrics: [
      { key: "pn05", label: "PN0.5", unit: "#/0.1L", color: "#06b6d4", decimals: 0 },
      { key: "pn10", label: "PN1.0", unit: "#/0.1L", color: "#0891b2", decimals: 0 },
      { key: "pn25", label: "PN2.5", unit: "#/0.1L", color: "#0e7490", decimals: 0 },
      { key: "pn40", label: "PN4.0", unit: "#/0.1L", color: "#155e75", decimals: 0 },
      { key: "pn100", label: "PN10", unit: "#/0.1L", color: "#164e63", decimals: 0 },
      { key: "tps", label: "Typical Size", unit: "µm", color: "#0d9488" },
    ],
  },
  {
    id: "health",
    label: "Sensor Health",
    icon: "🔋",
    summaryMetric: "battery",
    metrics: [
      { key: "battery", label: "Battery", unit: "%", color: "#22c55e", decimals: 0 },
      { key: "rssi", label: "WiFi RSSI", unit: "dBm", color: "#3b82f6", decimals: 0 },
      { key: "sdCard", label: "SD Card", unit: "", color: "#78716c", decimals: 0 },
    ],
  },
];

export const NOISE_METRIC: MetricDef = {
  key: "noiseDba",
  label: "Noise",
  unit: "dBA",
  color: "#c2410c",
};

export function getMetricDef(key: string): MetricDef | undefined {
  for (const group of METRIC_GROUPS) {
    const found = group.metrics.find((m) => m.key === key);
    if (found) return found;
  }
  if (key === "noiseDba") return NOISE_METRIC;
  return undefined;
}

export function formatMetricValue(
  value: number | null | undefined,
  key: string
): string {
  if (value == null) return "—";
  const def = getMetricDef(key);
  const decimals = def?.decimals ?? 1;
  if (key === "pressurePa") return (value / 1000).toFixed(decimals);
  return value.toFixed(decimals);
}

export function getMetricUnit(key: string): string {
  return getMetricDef(key)?.unit ?? "";
}

export type TimeRange = "24h" | "7d" | "30d";

export function getTimeRangeFrom(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export interface MetricDef {
  key: string;
  unit: string;
  color: string;
  decimals?: number;
  guideline?: { value: number; source: string; compare: "below" | "above" };
}

export interface MetricGroupDef {
  id: string;
  icon: string;
  summaryMetric: string;
  metrics: MetricDef[];
}

export const METRIC_GROUPS: MetricGroupDef[] = [
  {
    id: "environment",
    icon: "🌡",
    summaryMetric: "temperature",
    metrics: [
      { key: "temperature", unit: "°C", color: "#fb923c" },
      { key: "humidity", unit: "%", color: "#0d9488" },
      { key: "lightLux", unit: "lux", color: "#eab308", decimals: 0 },
      { key: "pressurePa", unit: "kPa", color: "#6366f1", decimals: 2 },
    ],
  },
  {
    id: "airQuality",
    icon: "🌫",
    summaryMetric: "pm25",
    metrics: [
      { key: "pm1", unit: "µg/m³", color: "#f97316" },
      { key: "pm25", unit: "µg/m³", color: "#ef4444", guideline: { value: 15, source: "WHO 24h", compare: "below" } },
      { key: "pm4", unit: "µg/m³", color: "#dc2626" },
      { key: "pm10", unit: "µg/m³", color: "#b91c1c", guideline: { value: 45, source: "WHO 24h", compare: "below" } },
    ],
  },
  {
    id: "uv",
    icon: "☀️",
    summaryMetric: "uvA",
    metrics: [
      { key: "uvA", unit: "µW/cm²", color: "#a855f7" },
      { key: "uvB", unit: "µW/cm²", color: "#7c3aed" },
      { key: "uvC", unit: "µW/cm²", color: "#6d28d9" },
    ],
  },
  {
    id: "particleCounts",
    icon: "🔬",
    summaryMetric: "pn25",
    metrics: [
      { key: "pn05", unit: "#/0.1L", color: "#06b6d4", decimals: 0 },
      { key: "pn10", unit: "#/0.1L", color: "#0891b2", decimals: 0 },
      { key: "pn25", unit: "#/0.1L", color: "#0e7490", decimals: 0 },
      { key: "pn40", unit: "#/0.1L", color: "#155e75", decimals: 0 },
      { key: "pn100", unit: "#/0.1L", color: "#164e63", decimals: 0 },
      { key: "tps", unit: "µm", color: "#0d9488" },
    ],
  },
];

export const NOISE_METRIC: MetricDef = {
  key: "noiseDba",
  unit: "dBA",
  color: "#c2410c",
  guideline: { value: 70, source: "WHO", compare: "below" },
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

export type TimeRange = "24h" | "48h" | "7d" | "30d";

export const TIME_RANGES: readonly TimeRange[] = ["24h", "48h", "7d", "30d"];

export function isTimeRange(value: string | null | undefined): value is TimeRange {
  return value != null && (TIME_RANGES as readonly string[]).includes(value);
}

export function getTimeRangeFrom(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "48h":
      return new Date(now.getTime() - 48 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

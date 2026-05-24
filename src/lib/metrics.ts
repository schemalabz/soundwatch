export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  decimals?: number;
  description?: string;
  guideline?: { value: number; source: string; compare: "below" | "above" };
}

export interface MetricGroupDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  summaryMetric: string;
  metrics: MetricDef[];
}

export const METRIC_GROUPS: MetricGroupDef[] = [
  {
    id: "environment",
    label: "Environment",
    icon: "🌡",
    description: "Basic weather and environmental conditions at the sensor location.",
    summaryMetric: "temperature",
    metrics: [
      {
        key: "temperature",
        label: "Temperature",
        unit: "°C",
        color: "#fb923c",
        description: "Air temperature measured by the sensor. Affected by direct sunlight and nearby heat sources.",
      },
      {
        key: "humidity",
        label: "Humidity",
        unit: "%",
        color: "#0d9488",
        description: "Relative humidity — the amount of moisture in the air. Comfortable range is 30–60%.",
      },
      {
        key: "lightLux",
        label: "Light",
        unit: "lux",
        color: "#eab308",
        decimals: 0,
        description: "Ambient light intensity. Full daylight is ~10,000–25,000 lux. Office lighting is ~300–500 lux.",
      },
      {
        key: "pressurePa",
        label: "Pressure",
        unit: "kPa",
        color: "#6366f1",
        decimals: 2,
        description: "Atmospheric pressure. Standard sea-level pressure is 101.325 kPa. Changes indicate weather shifts.",
      },
    ],
  },
  {
    id: "airQuality",
    label: "Air Quality",
    icon: "🌫",
    description: "Particulate matter — tiny particles suspended in the air that can affect health when inhaled.",
    summaryMetric: "pm25",
    metrics: [
      {
        key: "pm1",
        label: "PM1",
        unit: "µg/m³",
        color: "#f97316",
        description: "Ultra-fine particles smaller than 1 micrometer. Can penetrate deep into the lungs and enter the bloodstream.",
      },
      {
        key: "pm25",
        label: "PM2.5",
        unit: "µg/m³",
        color: "#ef4444",
        description: "Fine particles smaller than 2.5 micrometers — the most health-relevant air quality metric. Main sources: traffic, combustion, dust.",
        guideline: { value: 15, source: "WHO 24h", compare: "below" },
      },
      {
        key: "pm4",
        label: "PM4",
        unit: "µg/m³",
        color: "#dc2626",
        description: "Particles smaller than 4 micrometers. Includes PM2.5 plus some coarser particles.",
      },
      {
        key: "pm10",
        label: "PM10",
        unit: "µg/m³",
        color: "#b91c1c",
        description: "Coarse particles smaller than 10 micrometers. Sources include dust, pollen, and road wear. Can irritate the respiratory system.",
        guideline: { value: 45, source: "WHO 24h", compare: "below" },
      },
    ],
  },
  {
    id: "uv",
    label: "UV Radiation",
    icon: "☀️",
    description: "Ultraviolet radiation from the sun, measured in three wavelength bands.",
    summaryMetric: "uvA",
    metrics: [
      {
        key: "uvA",
        label: "UVA",
        unit: "µW/cm²",
        color: "#a855f7",
        description: "Long-wave UV (315–400nm). Penetrates deep into skin, causes aging. Present year-round, passes through clouds and glass.",
      },
      {
        key: "uvB",
        label: "UVB",
        unit: "µW/cm²",
        color: "#7c3aed",
        description: "Medium-wave UV (280–315nm). Causes sunburn and is the primary risk factor for skin cancer. Strongest midday in summer.",
      },
      {
        key: "uvC",
        label: "UVC",
        unit: "µW/cm²",
        color: "#6d28d9",
        description: "Short-wave UV (100–280nm). Mostly absorbed by the atmosphere. Readings near zero are normal.",
      },
    ],
  },
  {
    id: "particleCounts",
    label: "Particle Counts",
    icon: "🔬",
    description: "Number of particles per size category in a 0.1 liter air sample. Complements mass-based PM measurements.",
    summaryMetric: "pn25",
    metrics: [
      {
        key: "pn05",
        label: "PN0.5",
        unit: "#/0.1L",
        color: "#06b6d4",
        decimals: 0,
        description: "Count of particles larger than 0.5 µm. The smallest particles detected — high counts indicate combustion sources.",
      },
      {
        key: "pn10",
        label: "PN1.0",
        unit: "#/0.1L",
        color: "#0891b2",
        decimals: 0,
        description: "Count of particles larger than 1.0 µm.",
      },
      {
        key: "pn25",
        label: "PN2.5",
        unit: "#/0.1L",
        color: "#0e7490",
        decimals: 0,
        description: "Count of particles larger than 2.5 µm.",
      },
      {
        key: "pn40",
        label: "PN4.0",
        unit: "#/0.1L",
        color: "#155e75",
        decimals: 0,
        description: "Count of particles larger than 4.0 µm.",
      },
      {
        key: "pn100",
        label: "PN10",
        unit: "#/0.1L",
        color: "#164e63",
        decimals: 0,
        description: "Count of particles larger than 10 µm. These are coarse particles like dust and pollen.",
      },
      {
        key: "tps",
        label: "Typical Size",
        unit: "µm",
        color: "#0d9488",
        description: "The most common particle size in the sample. Helps identify the source — small (~0.5 µm) suggests combustion, large (~10 µm) suggests dust.",
      },
    ],
  },
  {
    id: "health",
    label: "Sensor Health",
    icon: "🔋",
    description: "Operational status of the sensor hardware.",
    summaryMetric: "battery",
    metrics: [
      {
        key: "battery",
        label: "Battery",
        unit: "%",
        color: "#22c55e",
        decimals: 0,
        description: "Remaining battery charge. Sensors at Skroutz stores are plugged in, so this should stay high.",
      },
      {
        key: "rssi",
        label: "WiFi RSSI",
        unit: "dBm",
        color: "#3b82f6",
        decimals: 0,
        description: "WiFi signal strength. Above -50 is excellent, -50 to -70 is good, below -70 may cause connectivity issues.",
      },
      {
        key: "sdCard",
        label: "SD Card",
        unit: "",
        color: "#78716c",
        decimals: 0,
        description: "Whether the SD card is present (1) or absent (0). Used for offline data buffering.",
      },
    ],
  },
];

export const NOISE_METRIC: MetricDef = {
  key: "noiseDba",
  label: "Noise",
  unit: "dBA",
  color: "#c2410c",
  description: "A-weighted sound pressure level — the standard measurement for environmental noise. Prolonged exposure above 70 dBA can cause hearing damage.",
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

export function getGuidelineBadge(
  value: number | null | undefined,
  key: string
): { text: string; color: string } | null {
  if (value == null) return null;
  const def = getMetricDef(key);
  if (!def?.guideline) return null;

  const { value: limit, source, compare } = def.guideline;
  const displayValue = key === "pressurePa" ? value / 1000 : value;

  if (compare === "below") {
    if (displayValue <= limit) {
      return { text: `Within ${source} limit (${limit} ${def.unit})`, color: "#22c55e" };
    }
    const ratio = displayValue / limit;
    if (ratio <= 2) {
      return { text: `Above ${source} limit of ${limit} ${def.unit}`, color: "#f97316" };
    }
    return { text: `${ratio.toFixed(1)}× ${source} limit of ${limit} ${def.unit}`, color: "#ef4444" };
  }

  return null;
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

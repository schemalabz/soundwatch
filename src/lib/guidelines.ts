import { getMetricDef } from "./metrics";

export function getTranslatedGuidelineBadge(
  value: number | null | undefined,
  key: string,
  t: (key: string, values?: Record<string, string | number>) => string
): { text: string; color: string } | null {
  if (value == null) return null;
  const def = getMetricDef(key);
  if (!def?.guideline) return null;

  const { value: limit, source, compare } = def.guideline;
  const displayValue = key === "pressurePa" ? value / 1000 : value;

  if (compare === "below") {
    if (displayValue <= limit) {
      return {
        text: t("within", { source, value: limit, unit: def.unit }),
        color: "#22c55e",
      };
    }
    const ratio = displayValue / limit;
    if (ratio <= 2) {
      return {
        text: t("above", { source, value: limit, unit: def.unit }),
        color: "#f97316",
      };
    }
    return {
      text: t("times", { ratio: ratio.toFixed(1), source, value: limit, unit: def.unit }),
      color: "#ef4444",
    };
  }

  return null;
}

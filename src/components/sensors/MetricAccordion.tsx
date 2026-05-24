"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  METRIC_GROUPS,
  formatMetricValue,
  getMetricUnit,
  type MetricGroupDef,
} from "@/lib/metrics";
import { getTranslatedGuidelineBadge } from "@/lib/guidelines";

const ReadingsChart = dynamic(
  () => import("@/components/sensors/ReadingsChart"),
  { ssr: false }
);

interface MetricAccordionProps {
  latestReading: Record<string, unknown> | null;
  readings: Record<string, unknown>[];
}

export default function MetricAccordion({
  latestReading,
  readings,
}: MetricAccordionProps) {
  const tMetrics = useTranslations("metrics");
  const tGuidelines = useTranslations("guidelines");
  const tSensor = useTranslations("sensor");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<
    Record<string, string>
  >({});
  const [showInfo, setShowInfo] = useState<string | null>(null);

  function toggleGroup(groupId: string) {
    setExpandedGroup(expandedGroup === groupId ? null : groupId);
    setShowInfo(null);
  }

  function selectMetric(groupId: string, metricKey: string) {
    setSelectedMetrics((prev) => ({ ...prev, [groupId]: metricKey }));
    setShowInfo(null);
  }

  function getSelectedMetric(group: MetricGroupDef): string {
    return selectedMetrics[group.id] ?? group.metrics[0].key;
  }

  function getSummaryValue(group: MetricGroupDef): string {
    if (!latestReading) return "—";
    const key = group.summaryMetric;
    const value = latestReading[key] as number | null;
    const formatted = formatMetricValue(value, key);
    const unit = getMetricUnit(key);
    return `${formatted} ${unit}`.trim();
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {METRIC_GROUPS.map((group) => {
        const isExpanded = expandedGroup === group.id;
        const activeMetricKey = getSelectedMetric(group);
        const activeMetric = group.metrics.find(
          (m) => m.key === activeMetricKey
        )!;
        const currentValue = latestReading
          ? (latestReading[activeMetricKey] as number | null)
          : null;
        const badge = getTranslatedGuidelineBadge(currentValue, activeMetricKey, tGuidelines);

        return (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className={`w-full px-4 py-3 flex items-center justify-between text-left border-b border-border transition-colors ${
                isExpanded ? "bg-light" : "hover:bg-light/50"
              }`}
            >
              <span
                className={`font-semibold text-sm ${
                  isExpanded ? "text-primary" : ""
                }`}
              >
                {group.icon} {tMetrics(`${group.id}.label`)}
              </span>
              <span className="text-xs text-muted">
                {!isExpanded && (
                  <>
                    {tMetrics(`${group.summaryMetric}.label`)}: {getSummaryValue(group)}{" "}
                  </>
                )}
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>

            {isExpanded && (
              <div className="p-4 border-b border-border bg-white">
                <p className="text-xs text-muted mb-3">
                  {tMetrics(`${group.id}.description`)}
                </p>

                <div className="flex gap-2 mb-4 flex-wrap">
                  {group.metrics.map((metric) => (
                    <button
                      key={metric.key}
                      onClick={() => selectMetric(group.id, metric.key)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        activeMetricKey === metric.key
                          ? "bg-primary text-white"
                          : "bg-light text-muted hover:text-foreground"
                      }`}
                    >
                      {tMetrics(`${metric.key}.label`)}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">
                      {formatMetricValue(currentValue, activeMetricKey)}
                    </span>
                    <span className="text-sm text-muted">
                      {activeMetric.unit}
                    </span>
                  </div>

                  {badge && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: badge.color + "18",
                        color: badge.color,
                      }}
                    >
                      {badge.text}
                    </span>
                  )}

                  <button
                    onClick={() =>
                      setShowInfo(
                        showInfo === activeMetricKey ? null : activeMetricKey
                      )
                    }
                    className="text-muted hover:text-foreground transition-colors text-sm"
                    title={tSensor("whatIsThis")}
                  >
                    ℹ️
                  </button>
                </div>

                {showInfo === activeMetricKey && (
                  <div className="bg-light border border-border rounded-lg p-3 mb-3 text-xs text-muted leading-relaxed">
                    {tMetrics(`${activeMetricKey}.description`)}
                  </div>
                )}

                <ReadingsChart
                  readings={readings}
                  metricKey={activeMetricKey}
                  height={200}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

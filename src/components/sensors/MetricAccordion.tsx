"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  METRIC_GROUPS,
  formatMetricValue,
  getMetricUnit,
  type MetricGroupDef,
} from "@/lib/metrics";

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
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<
    Record<string, string>
  >({});

  function toggleGroup(groupId: string) {
    setExpandedGroup(expandedGroup === groupId ? null : groupId);
  }

  function selectMetric(groupId: string, metricKey: string) {
    setSelectedMetrics((prev) => ({ ...prev, [groupId]: metricKey }));
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

  function getSummaryLabel(group: MetricGroupDef): string {
    const metric = group.metrics.find((m) => m.key === group.summaryMetric);
    return metric?.label ?? "";
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
                {group.icon} {group.label}
              </span>
              <span className="text-xs text-muted">
                {!isExpanded && (
                  <>
                    {getSummaryLabel(group)}: {getSummaryValue(group)}{" "}
                  </>
                )}
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>

            {isExpanded && (
              <div className="p-4 border-b border-border bg-white">
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
                      {metric.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-2xl font-bold">
                    {formatMetricValue(currentValue, activeMetricKey)}
                  </span>
                  <span className="text-sm text-muted">
                    {activeMetric.unit}
                  </span>
                </div>

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

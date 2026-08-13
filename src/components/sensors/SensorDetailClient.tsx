"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { getNoiseLevelColor } from "@/lib/geo";
import { type TimeRange, getTimeRangeFrom, NOISE_METRIC } from "@/lib/metrics";
import { getTranslatedGuidelineBadge } from "@/lib/guidelines";
import TimeRangeSelector from "@/components/sensors/TimeRangeSelector";
import MetricAccordion from "@/components/sensors/MetricAccordion";

const ReadingsChart = dynamic(
  () => import("@/components/sensors/ReadingsChart"),
  { ssr: false }
);

interface SensorDetailClientProps {
  sensor: Record<string, unknown> & {
    id: string;
    deviceId: string;
    name: string | null;
    address: string | null;
    firmwareVersion: string | null;
    readingIntervalS: number;
    lastSeenAt: string | null;
    latitude: number | null;
    longitude: number | null;
    latestReading: Record<string, unknown> | null;
  };
  initialReadings: Record<string, unknown>[];
  initialRange: TimeRange;
}

function getTranslatedNoiseLabel(
  dba: number,
  t: (key: string) => string
): string {
  if (dba < 55) return t("quiet");
  if (dba < 65) return t("moderate");
  if (dba < 75) return t("loud");
  return t("veryLoud");
}

export default function SensorDetailClient({
  sensor,
  initialReadings,
  initialRange,
}: SensorDetailClientProps) {
  const t = useTranslations("sensor");
  const tNoise = useTranslations("noise");
  const tMetrics = useTranslations("metrics");
  const tGuidelines = useTranslations("guidelines");
  const router = useRouter();
  const pathname = usePathname();
  const [timeRange, setTimeRange] = useState<TimeRange>(initialRange);
  const [readings, setReadings] = useState(initialReadings);

  function handleRangeChange(range: TimeRange) {
    setTimeRange(range);
    router.replace(`${pathname}?range=${range}`, { scroll: false });
  }

  useEffect(() => {
    const from = getTimeRangeFrom(timeRange).toISOString();
    fetch(`/api/sensors/${sensor.id}/readings?from=${from}&limit=5000`)
      .then((r) => r.json())
      .then((data) => setReadings(data.readings))
      .catch(console.error);
  }, [timeRange, sensor.id]);

  const dba = sensor.latestReading?.noiseDba as number | null;
  const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";
  const label = dba != null ? getTranslatedNoiseLabel(dba, tNoise) : t("noData");

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        {t("backToMap")}
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          {sensor.name || sensor.deviceId}
        </h1>
        {sensor.address && (
          <p className="text-muted mt-1">{sensor.address}</p>
        )}
      </div>

      {/* Noise hero */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-4xl font-bold" style={{ color }}>
            {dba != null ? dba.toFixed(1) : "—"}
          </span>
          <span className="text-muted">{NOISE_METRIC.unit}</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: color, color: "white" }}
          >
            {label}
          </span>
          {(() => {
            const badge = getTranslatedGuidelineBadge(dba, "noiseDba", tGuidelines);
            return badge ? (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: badge.color + "18",
                  color: badge.color,
                }}
              >
                {badge.text}
              </span>
            ) : null;
          })()}
        </div>
        <TimeRangeSelector value={timeRange} onChange={handleRangeChange} />
      </div>
      <p className="text-xs text-muted mb-4">{tMetrics("noiseDba.description")}</p>

      {/* Noise chart */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <ReadingsChart readings={readings} metricKey="noiseDba" height={280} />
      </div>

      {/* Secondary metrics accordion */}
      <div className="mb-6">
        <MetricAccordion
          latestReading={sensor.latestReading}
          readings={readings}
        />
      </div>

      {/* Sensor info */}
      <div className="rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t("info")}</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <dt className="text-muted">{t("deviceId")}</dt>
          <dd className="font-mono text-muted">{sensor.deviceId}</dd>
          <dt className="text-muted">{t("firmware")}</dt>
          <dd className="text-muted">{sensor.firmwareVersion || "—"}</dd>
          <dt className="text-muted">{t("readingInterval")}</dt>
          <dd className="text-muted">{sensor.readingIntervalS}s</dd>
          <dt className="text-muted">{t("lastSeen")}</dt>
          <dd className="text-muted">
            {sensor.lastSeenAt
              ? new Date(sensor.lastSeenAt).toLocaleString()
              : t("never")}
          </dd>
          <dt className="text-muted">{t("coordinates")}</dt>
          <dd className="text-muted">
            {sensor.latitude != null && sensor.longitude != null
              ? `${sensor.latitude.toFixed(4)}, ${sensor.longitude.toFixed(4)}`
              : "—"}
          </dd>
        </dl>
        {sensor.latestReading && (
          <div className="mt-3 pt-3 border-t border-border/50 flex gap-4 text-[11px] text-muted/60 flex-wrap">
            {sensor.latestReading.battery != null && (
              <span>{t("battery")} {Math.round(sensor.latestReading.battery as number)}%</span>
            )}
            {sensor.latestReading.rssi != null && (
              <span>{t("wifi")} {Math.round(sensor.latestReading.rssi as number)} dBm</span>
            )}
            {sensor.latestReading.sdCard != null && (
              <span>{t("sdCard")} {(sensor.latestReading.sdCard as number) === 1 ? "✓" : "✗"}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

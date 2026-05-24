"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getNoiseLevelColor, getNoiseLevelLabel } from "@/lib/geo";
import { type TimeRange, getTimeRangeFrom } from "@/lib/metrics";
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
}

export default function SensorDetailClient({
  sensor,
  initialReadings,
}: SensorDetailClientProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [readings, setReadings] = useState(initialReadings);

  useEffect(() => {
    const from = getTimeRangeFrom(timeRange).toISOString();
    fetch(`/api/sensors/${sensor.id}/readings?from=${from}&limit=5000`)
      .then((r) => r.json())
      .then((data) => setReadings(data.readings))
      .catch(console.error);
  }, [timeRange, sensor.id]);

  const dba = sensor.latestReading?.noiseDba as number | null;
  const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";
  const label = dba != null ? getNoiseLevelLabel(dba) : "No data";

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        ← Back to map
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold" style={{ color }}>
            {dba != null ? dba.toFixed(1) : "—"}
          </span>
          <span className="text-muted">dBA</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: color, color: "white" }}
          >
            {label}
          </span>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

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
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-bold mb-4">Sensor Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <dt className="text-muted">Device ID</dt>
          <dd className="font-mono">{sensor.deviceId}</dd>
          <dt className="text-muted">Firmware</dt>
          <dd>{sensor.firmwareVersion || "—"}</dd>
          <dt className="text-muted">Reading Interval</dt>
          <dd>{sensor.readingIntervalS}s</dd>
          <dt className="text-muted">Last Seen</dt>
          <dd>
            {sensor.lastSeenAt
              ? new Date(sensor.lastSeenAt).toLocaleString()
              : "Never"}
          </dd>
          <dt className="text-muted">Coordinates</dt>
          <dd>
            {sensor.latitude != null && sensor.longitude != null
              ? `${sensor.latitude.toFixed(4)}, ${sensor.longitude.toFixed(4)}`
              : "—"}
          </dd>
        </dl>
      </div>
    </div>
  );
}

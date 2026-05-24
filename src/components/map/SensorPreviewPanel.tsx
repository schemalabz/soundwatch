"use client";

import Link from "next/link";
import { getNoiseLevelColor, getNoiseLevelLabel } from "@/lib/geo";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: Record<string, unknown> | null;
}

interface SensorPreviewPanelProps {
  sensor: SensorData;
  onClose: () => void;
}

export default function SensorPreviewPanel({
  sensor,
  onClose,
}: SensorPreviewPanelProps) {
  const dba = sensor.latestReading?.noiseDba as number | null;
  const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";
  const label = dba != null ? getNoiseLevelLabel(dba) : "No data";
  const r = sensor.latestReading;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 animate-slide-up">
      <div className="bg-white border-t border-border rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-4 mx-auto max-w-lg">
        {/* Drag handle + close */}
        <div className="relative mb-3">
          <div className="w-8 h-1 bg-border rounded-full mx-auto" />
          <button
            onClick={onClose}
            className="absolute -top-1 right-0 text-muted hover:text-foreground text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">
              {sensor.name || sensor.deviceId}
            </h3>
            {sensor.address && (
              <p className="text-xs text-muted truncate">{sensor.address}</p>
            )}
          </div>
          <div className="text-right ml-4">
            <p className="text-3xl font-bold" style={{ color }}>
              {dba != null ? dba.toFixed(1) : "—"}
            </p>
            <p className="text-xs font-semibold" style={{ color }}>
              {label} · dBA
            </p>
          </div>
        </div>

        {/* Quick metrics */}
        <div className="flex gap-3 text-xs text-muted mb-4 flex-wrap">
          {r?.temperature != null && (
            <span>🌡 {(r.temperature as number).toFixed(1)}°C</span>
          )}
          {r?.humidity != null && (
            <span>💧 {(r.humidity as number).toFixed(1)}%</span>
          )}
          {r?.pm25 != null && (
            <span>🌫 PM2.5: {(r.pm25 as number).toFixed(1)}</span>
          )}
          {r?.uvA != null && (
            <span>☀️ UVA: {(r.uvA as number).toFixed(1)}</span>
          )}
        </div>

        {/* Action */}
        <Link
          href={`/sensors/${sensor.id}`}
          className="block text-center bg-primary text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-dark transition-colors"
        >
          View details →
        </Link>
      </div>

      {/* Backdrop to close on map click */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

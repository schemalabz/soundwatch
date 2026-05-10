"use client";

import Link from "next/link";
import { getNoiseLevelColor, getNoiseLevelLabel } from "@/lib/geo";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: {
    noiseDba: number | null;
  } | null;
}

interface LeaderboardPanelProps {
  sensors: SensorData[];
  mode?: "noisiest" | "quietest";
}

export default function LeaderboardPanel({
  sensors,
  mode = "noisiest",
}: LeaderboardPanelProps) {
  const withNoise = sensors
    .filter((s) => s.latestReading?.noiseDba != null)
    .sort((a, b) => {
      const aDb = a.latestReading!.noiseDba!;
      const bDb = b.latestReading!.noiseDba!;
      return mode === "noisiest" ? bDb - aDb : aDb - bDb;
    });

  return (
    <div className="space-y-2">
      {withNoise.length === 0 && (
        <p className="text-sm text-gray-500">No sensor data available</p>
      )}
      {withNoise.map((sensor, i) => {
        const dba = sensor.latestReading!.noiseDba!;
        const color = getNoiseLevelColor(dba);
        const label = getNoiseLevelLabel(dba);

        return (
          <Link
            key={sensor.id}
            href={`/sensors/${sensor.id}`}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="text-lg font-bold text-gray-400 w-6 text-right">
              {i + 1}
            </span>
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {sensor.name || sensor.deviceId}
              </p>
              {sensor.address && (
                <p className="text-xs text-gray-500 truncate">
                  {sensor.address}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold">{dba.toFixed(1)} dBA</p>
              <p className="text-xs" style={{ color }}>
                {label}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

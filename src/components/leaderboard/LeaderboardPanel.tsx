"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getNoiseLevelColor } from "@/lib/geo";
import { NOISE_METRIC } from "@/lib/metrics";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: Record<string, unknown> | null;
}

interface LeaderboardPanelProps {
  sensors: SensorData[];
  mode?: "noisiest" | "quietest";
  limit?: number;
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

export default function LeaderboardPanel({
  sensors,
  mode = "noisiest",
  limit,
}: LeaderboardPanelProps) {
  const t = useTranslations("leaderboard");
  const tNoise = useTranslations("noise");

  const withNoise = sensors
    .filter((s) => (s.latestReading?.noiseDba as number | undefined) != null)
    .sort((a, b) => {
      const aDb = a.latestReading!.noiseDba as number;
      const bDb = b.latestReading!.noiseDba as number;
      return mode === "noisiest" ? bDb - aDb : aDb - bDb;
    })
    .slice(0, limit);

  return (
    <div className="space-y-1">
      {withNoise.length === 0 && (
        <p className="text-sm text-muted">{t("noData")}</p>
      )}
      {withNoise.map((sensor, i) => {
        const dba = sensor.latestReading!.noiseDba as number;
        const color = getNoiseLevelColor(dba);
        const label = getTranslatedNoiseLabel(dba, tNoise);

        return (
          <Link
            key={sensor.id}
            href={`/sensors/${sensor.id}`}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-light transition-colors"
          >
            <span className="text-lg font-bold text-muted/50 w-6 text-right">
              {i + 1}
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {sensor.name || sensor.deviceId}
              </p>
              {sensor.address && (
                <p className="text-xs text-muted truncate">
                  {sensor.address}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-sm">
                {dba.toFixed(1)} {NOISE_METRIC.unit}
              </p>
              <p className="text-xs font-semibold" style={{ color }}>
                {label}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getNoiseLevelColor } from "@/lib/geo";

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
    <div>
      {withNoise.length === 0 && (
        <p className="text-sm text-muted py-2">{t("noData")}</p>
      )}
      {withNoise.map((sensor, i) => {
        const dba = sensor.latestReading!.noiseDba as number;
        const color = getNoiseLevelColor(dba);
        const label = getTranslatedNoiseLabel(dba, tNoise);

        return (
          <Link
            key={sensor.id}
            href={`/sensors/${sensor.id}`}
            className="group flex items-center gap-3 py-3 border-b-[0.5px] border-hairline last:border-b-0 transition-opacity hover:opacity-80"
          >
            <span className="sw-label text-sm w-5 text-right tabular-nums">
              {i + 1}
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-light text-sm text-ink truncate">
                {sensor.name || sensor.deviceId}
              </p>
              {sensor.address && (
                <p className="sw-label text-xs truncate">{sensor.address}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-light text-sm text-ink tabular-nums">
                {dba.toFixed(1)} dBA
              </p>
              <p className="sw-label text-xs" style={{ color }}>
                {label}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

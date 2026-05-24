"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";
import SensorPreviewPanel from "@/components/map/SensorPreviewPanel";

const SensorMap = dynamic(() => import("@/components/map/SensorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-light">
      <span className="text-muted animate-pulse">...</span>
    </div>
  ),
});

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  latestReading: Record<string, unknown> | null;
}

export function MapSection({ sensors }: { sensors: SensorData[] }) {
  const t = useTranslations("map");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);

  return (
    <div className="flex flex-1 flex-col md:flex-row relative overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <SensorMap
          sensors={sensors}
          selectedSensorId={selectedSensor?.id}
          onSensorClick={(sensor) => setSelectedSensor(sensor as SensorData)}
        />

        {selectedSensor && (
          <SensorPreviewPanel
            sensor={selectedSensor}
            onClose={() => setSelectedSensor(null)}
          />
        )}

        {!selectedSensor && (
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-2 rounded-lg font-semibold shadow-lg z-10"
          >
            {showLeaderboard ? t("showMap") : t("leaderboard")}
          </button>
        )}
      </div>
      <aside
        className={`${
          showLeaderboard ? "block" : "hidden"
        } md:block w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-white overflow-y-auto p-4 max-h-[40vh] md:max-h-none`}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted">
            {t("sensorsActive", { count: sensors.length })}
          </span>
          {sensors.some((s) => s.latestReading) && (
            <span className="text-xs text-muted">
              {t("updated", {
                time: new Date(
                  Math.max(
                    ...sensors
                      .filter((s) => s.latestReading?.recordedAt)
                      .map((s) => new Date(s.latestReading!.recordedAt as string).getTime())
                  )
                ).toLocaleTimeString(),
              })}
            </span>
          )}
        </div>

        <h2 className="text-lg font-bold mb-1">{t("noisiestRightNow")}</h2>
        <LeaderboardPanel sensors={sensors} mode="noisiest" limit={5} />

        <Link
          href="/leaderboard"
          className="block text-center text-primary text-sm font-semibold mt-3 hover:underline"
        >
          {t("viewFullLeaderboard")}
        </Link>
      </aside>
    </div>
  );
}

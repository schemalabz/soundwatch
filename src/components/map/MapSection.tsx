"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";
import SensorPreviewPanel from "@/components/map/SensorPreviewPanel";

const SensorMap = dynamic(() => import("@/components/map/SensorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-light">
      <span className="text-muted">Loading map...</span>
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

        {/* Preview panel */}
        {selectedSensor && (
          <SensorPreviewPanel
            sensor={selectedSensor}
            onClose={() => setSelectedSensor(null)}
          />
        )}

        {/* Mobile toggle button — hide when preview panel is open */}
        {!selectedSensor && (
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-2 rounded-lg font-semibold shadow-lg z-10"
          >
            {showLeaderboard ? "Show Map" : "Leaderboard"}
          </button>
        )}
      </div>
      <aside
        className={`${
          showLeaderboard ? "block" : "hidden"
        } md:block w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-white overflow-y-auto p-4 max-h-[40vh] md:max-h-none`}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted">
            {sensors.length} sensor{sensors.length !== 1 ? "s" : ""} active
          </span>
          {sensors.some((s) => s.latestReading) && (
            <span className="text-xs text-muted">
              Updated {new Date(
                Math.max(
                  ...sensors
                    .filter((s) => s.latestReading?.recordedAt)
                    .map((s) => new Date(s.latestReading!.recordedAt as string).getTime())
                )
              ).toLocaleTimeString()}
            </span>
          )}
        </div>

        <h2 className="text-lg font-bold mb-1">Noisiest Right Now</h2>
        <LeaderboardPanel sensors={sensors} mode="noisiest" limit={5} />

        <Link
          href="/leaderboard"
          className="block text-center text-primary text-sm font-semibold mt-3 hover:underline"
        >
          View full leaderboard →
        </Link>
      </aside>
    </div>
  );
}

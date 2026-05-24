"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
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
    <div className="flex flex-1 flex-col md:flex-row relative">
      <div className="flex-1 relative min-h-[60vh] md:min-h-0">
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
        <h2 className="text-lg font-bold mb-1">Soundwatch Leaderboard</h2>
        <p className="text-xs text-muted mb-4">Noisiest areas right now</p>
        <LeaderboardPanel sensors={sensors} mode="noisiest" />
      </aside>
    </div>
  );
}

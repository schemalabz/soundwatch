"use client";

import dynamic from "next/dynamic";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";

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
  latestReading: {
    noiseDba: number | null;
  } | null;
}

export function MapSection({ sensors }: { sensors: SensorData[] }) {
  return (
    <div className="flex flex-1">
      <div className="flex-1 relative">
        <SensorMap sensors={sensors} />
      </div>
      <aside className="w-80 border-l border-border bg-white overflow-y-auto p-4">
        <h2 className="text-lg font-bold mb-1">Soundwatch Leaderboard</h2>
        <p className="text-xs text-muted mb-4">Noisiest areas right now</p>
        <LeaderboardPanel sensors={sensors} mode="noisiest" />
      </aside>
    </div>
  );
}

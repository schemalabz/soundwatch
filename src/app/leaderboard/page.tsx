"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: {
    noiseDba: number | null;
  } | null;
}

export default function LeaderboardPage() {
  const [sensors, setSensors] = useState<SensorData[]>([]);
  const [mode, setMode] = useState<"noisiest" | "quietest">("noisiest");

  useEffect(() => {
    fetch("/api/sensors")
      .then((r) => r.json())
      .then(setSensors)
      .catch(console.error);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-blue-600 text-sm hover:underline">
        ← Back to map
      </Link>

      <h1 className="text-3xl font-bold mt-4 mb-2">Soundwatch Leaderboard</h1>
      <p className="text-gray-500 mb-6">
        Ranking of noise levels across Athens
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode("noisiest")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "noisiest"
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Noisiest
        </button>
        <button
          onClick={() => setMode("quietest")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "quietest"
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Quietest
        </button>
      </div>

      <LeaderboardPanel sensors={sensors} mode={mode} />
    </div>
  );
}

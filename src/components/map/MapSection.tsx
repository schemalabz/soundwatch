"use client";

import { useEffect, useState } from "react";
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
  isExperimental?: boolean;
  latestReading: Record<string, unknown> | null;
}

export function MapSection({ sensors }: { sensors: SensorData[] }) {
  const t = useTranslations("map");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);
  // Admin-only extra: when an admin token from a previous /admin login is in
  // localStorage, offer bench units on the map. Showing the toggle trusts
  // localStorage; showing the DATA is gated server-side — a forged toggle
  // without a valid token gets the public list.
  const [isAdmin, setIsAdmin] = useState(false);
  const [showBench, setShowBench] = useState(false);
  const [allSensors, setAllSensors] = useState<SensorData[] | null>(null);

  useEffect(() => {
    // Deferred a microtask: the effect body itself sets no state
    // (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() =>
      setIsAdmin(Boolean(localStorage.getItem("sw-admin-token")))
    );
  }, []);

  useEffect(() => {
    if (!showBench || allSensors) return;
    const adminToken = localStorage.getItem("sw-admin-token");
    if (!adminToken) return;
    fetch("/api/sensors?includeExperimental=1", {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setAllSensors(j); })
      .catch(() => {});
  }, [showBench, allSensors]);

  const shown = showBench && allSensors ? allSensors : sensors;

  return (
    <div className="flex flex-1 flex-col md:flex-row relative overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <SensorMap
          sensors={shown}
          selectedSensorId={selectedSensor?.id}
          onSensorClick={(sensor) => setSelectedSensor(sensor as SensorData)}
        />

        {isAdmin && (
          <label className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white/90 border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted cursor-pointer shadow-sm">
            <input
              type="checkbox"
              checked={showBench}
              onChange={(e) => setShowBench(e.target.checked)}
              className="rounded border-border"
            />
            bench units
          </label>
        )}

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
            {t("sensorsActive", { count: shown.length })}
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
        <LeaderboardPanel sensors={shown} mode="noisiest" limit={5} />

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

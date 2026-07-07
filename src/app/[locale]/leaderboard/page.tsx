"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  const t = useTranslations("leaderboard");
  const [sensors, setSensors] = useState<SensorData[]>([]);
  const [mode, setMode] = useState<"noisiest" | "quietest">("noisiest");

  useEffect(() => {
    fetch("/api/sensors")
      .then((r) => r.json())
      .then(setSensors)
      .catch(console.error);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 w-full overflow-y-auto sw-scroll">
      <Link href="/" className="sw-label text-xs text-muted hover:text-ink">
        {t("backToMap")}
      </Link>

      <h1 className="sw-h text-[34px] mt-5 mb-2">{t("title")}</h1>
      <p className="text-muted text-sm mb-7">{t("subtitle")}</p>

      <div className="sw-chiptrack mb-7">
        <button
          onClick={() => setMode("noisiest")}
          className="sw-chip"
          data-active={mode === "noisiest"}
        >
          {t("noisiest")}
        </button>
        <button
          onClick={() => setMode("quietest")}
          className="sw-chip"
          data-active={mode === "quietest"}
        >
          {t("quietest")}
        </button>
      </div>

      <div className="border-[0.5px] border-hairline rounded-md px-5 bg-panel">
        <LeaderboardPanel sensors={sensors} mode={mode} />
      </div>
    </div>
  );
}

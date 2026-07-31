"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";
import MetricGauge from "@/components/dashboard/MetricGauge";
import TimeRangeSelector from "@/components/sensors/TimeRangeSelector";
import SectionHeader from "@/components/dashboard/SectionHeader";
import HourlyChart from "@/components/dashboard/HourlyChart";
import ForecastGrid from "@/components/dashboard/ForecastGrid";
import NoiseCalendar from "@/components/dashboard/NoiseCalendar";
import SeasonsChart from "@/components/dashboard/SeasonsChart";
import YearWheel from "@/components/dashboard/YearWheel";
import { getNoiseLevel, getNoiseLevelColor, type MapLayer } from "@/lib/geo";
import { getTranslatedGuidelineBadge } from "@/lib/guidelines";
import {
  formatMetricValue,
  getTimeRangeFrom,
  type TimeRange,
} from "@/lib/metrics";

const ReadingsChart = dynamic(
  () => import("@/components/sensors/ReadingsChart"),
  { ssr: false }
);

export interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive?: boolean | null;
  lastSeenAt?: string | null;
  latestReading: Record<string, unknown> | null;
}

interface SensorPanelProps {
  sensors: SensorData[];
  selected: SensorData | null;
  activeLayer?: MapLayer;
  radiusSensors?: SensorData[];
}

function noiseLabel(dba: number, t: (k: string) => string): string {
  const lvl = getNoiseLevel(dba);
  return t(
    lvl === "very_loud" ? "veryLoud" : lvl === "quiet" ? "quiet" : lvl
  );
}

export default function SensorPanel({
  sensors,
  selected,
  activeLayer = "noise",
  radiusSensors = [],
}: SensorPanelProps) {
  const t = useTranslations("dashboard");
  const tNoise = useTranslations("noise");
  const tMetrics = useTranslations("metrics");
  const tGuidelines = useTranslations("guidelines");
  const tSensor = useTranslations("sensor");

  const nowMonth = new Date().getMonth();

  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [readings, setReadings] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const from = getTimeRangeFrom(timeRange).toISOString();
    fetch(`/api/sensors/${selected.id}/readings?from=${from}&limit=5000`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setReadings(data.readings ?? []);
      })
      .catch(() => {
        if (!cancelled) setReadings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, timeRange]);

  /* ---------- Overview (nothing selected) ---------- */
  if (!selected) {
    return (
      <PanelShell>
        {/* Header/title now lives in the sidebar controls above (MapSection). */}
        <HourlyChart metric={activeLayer} sensors={radiusSensors} />

        {/* Noise-specific sections — only shown when the noise tab is active. */}
        {activeLayer === "noise" && (
          <>
            <section className="sw-section pb-10">
              <SectionHeader title={t("noisiestNow")} />
              <div className="px-6 mt-4">
                <LeaderboardPanel sensors={sensors} mode="noisiest" limit={8} />
              </div>
              <div className="px-6 mt-5">
                <Link href="/leaderboard" className="sw-label text-xs text-ink hover:opacity-70">
                  {t("viewFullLeaderboard")}
                </Link>
              </div>
            </section>

            <ForecastGrid />
            <NoiseCalendar />
            <SeasonsChart nowMonth={nowMonth} />
            <YearWheel nowMonth={nowMonth} />

            {/* Experimental — kept at the bottom. */}
            <SoundClassBreakdown sensors={radiusSensors} />
          </>
        )}

        <Footer />
      </PanelShell>
    );
  }

  /* ---------- Selected sensor detail ---------- */
  const lr = selected.latestReading;
  const dba = lr?.noiseDba as number | null | undefined;
  const heroColor = dba != null ? getNoiseLevelColor(dba) : "var(--sw-muted)";
  const heroBadge = dba != null ? noiseLabel(dba, tNoise) : tSensor("noData");
  const noiseGuide =
    dba != null ? getTranslatedGuidelineBadge(dba, "noiseDba", tGuidelines) : null;

  const gauges = [
    { key: "pm25", max: 50, dot: 10 },
    { key: "temperature", max: 45, dot: 6 },
    { key: "humidity", max: 100, dot: 6 },
  ];

  return (
    <PanelShell>
      {/* Location + hero */}
      <div className="px-6 pt-8 pb-12 sw-section flex flex-col gap-10">
        <div className="flex items-start gap-2.5">
          <span className="sw-h text-[18px]">{selected.name || selected.deviceId}</span>
          {selected.address && (
            <span className="sw-eyebrow pt-1">{selected.address}</span>
          )}
        </div>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="sw-hero text-[88px]" style={{ color: heroColor }}>
            {dba != null ? dba.toFixed(1) : "—"}
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <span className="sw-badge">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: heroColor, transition: "background 300ms" }}
              />
              <span className="sw-badge-label">{heroBadge}</span>
            </span>
            <span className="sw-label text-xs">dBA</span>
          </div>
        </div>
        {noiseGuide && (
          <span
            className="text-xs self-start px-2.5 py-1 rounded"
            style={{ background: noiseGuide.color + "20", color: noiseGuide.color }}
          >
            {noiseGuide.text}
          </span>
        )}
      </div>

      <HourlyChart metric={activeLayer} sensors={selected ? [selected] : []} />

      {/* Breakdown gauges */}
      <section className="sw-section pb-12">
        <SectionHeader title={t("breakdown")} />
        <div className="flex px-6 pb-10 mt-7">
          {gauges.map((g, i) => {
            const raw = lr?.[g.key] as number | null | undefined;
            const def = getTranslatedGuidelineBadge(raw ?? null, g.key, tGuidelines);
            const color = def?.color ?? getMetricColor(g.key);
            return (
              <div key={g.key} className="flex flex-1 min-w-0">
                {i > 0 && <Divider />}
                <MetricGauge
                  label={tMetrics(`${g.key}.label`)}
                  value={raw ?? null}
                  display={formatMetricValue(raw, g.key)}
                  fraction={raw != null ? raw / g.max : 0}
                  color={color}
                  statusText={def?.text ?? null}
                  dotSize={g.dot}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* 7-day forecast (illustrative) */}
      <ForecastGrid />

      {/* Seasonal calendar (illustrative) */}
      <NoiseCalendar />

      {/* Seasons (illustrative) */}
      <SeasonsChart nowMonth={nowMonth} />

      {/* Year at a glance (illustrative) */}
      <YearWheel nowMonth={nowMonth} />

      {/* History */}
      <section className="sw-section pb-12">
        <SectionHeader
          title={t("history")}
          right={<TimeRangeSelector value={timeRange} onChange={setTimeRange} />}
        />
        <div className="px-6 mt-6">
          <ReadingsChart readings={readings} metricKey="noiseDba" height={220} />
        </div>
      </section>

      {/* Sensor info */}
      <section className="sw-section pb-12">
        <SectionHeader title={tSensor("info")} />
        <div className="px-6 mt-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
            <dt className="sw-label">{tSensor("deviceId")}</dt>
            <dd className="font-mono text-muted">{selected.deviceId}</dd>
            <dt className="sw-label">{tSensor("coordinates")}</dt>
            <dd className="text-muted">
              {selected.latitude != null && selected.longitude != null
                ? `${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`
                : "—"}
            </dd>
          </dl>
          <Link
            href={`/sensors/${selected.id}`}
            className="sw-label text-xs text-ink hover:opacity-70 inline-block mt-5"
          >
            {tSensor("viewDetails")}
          </Link>
        </div>
      </section>

      <Footer />
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg text-ink" style={{ containerType: "inline-size" }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="w-px self-stretch bg-hairline shrink-0 mx-3" />;
}

function Footer() {
  const t = useTranslations("dashboard");
  return (
    <div className="px-6 py-6">
      <span className="sw-label text-xs">{t("footer")}</span>
    </div>
  );
}

// Distribution of the dominant detected sound class across the in-radius sensors.
const SOUND_CLASSES: { key: string; color: string }[] = [
  { key: "siren", color: "#d6342a" },
  { key: "dog_bark", color: "#ec832c" },
  { key: "engine_idling", color: "#e8b335" },
  { key: "constructions", color: "#4f5d75" },
];

function SoundClassBreakdown({ sensors }: { sensors: SensorData[] }) {
  const t = useTranslations("dashboard");
  const counts = SOUND_CLASSES.map((c) => ({
    ...c,
    n: sensors.filter((s) => s.latestReading?.noiseClass === c.key).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.n));

  return (
    <section className="sw-section pb-10">
      <div className="px-6 pt-5 flex items-center gap-2.5">
        <h3 className="sw-h text-[16px]">{t("soundClasses.title")}</h3>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: "rgba(239,131,84,0.18)", color: "#ef8354" }}
        >
          beta
        </span>
      </div>
      <p className="px-6 sw-label text-xs mt-1.5">{t("soundClasses.subtitle")}</p>
      <div className="px-6 mt-5 flex flex-col gap-3.5">
        {counts.map((c) => (
          <div key={c.key} className="flex items-center gap-3">
            <span className="text-xs w-32 shrink-0 text-muted">{t(`soundClasses.${c.key}`)}</span>
            <div
              className="flex-1 h-2.5 rounded-full overflow-hidden"
              style={{ background: "var(--sw-chrome-bg)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${(c.n / max) * 100}%`, background: c.color }}
              />
            </div>
            <span className="text-xs tabular-nums text-ink w-5 text-right">{c.n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function getMetricColor(key: string): string {
  switch (key) {
    case "pm25":
      return "#ec832c";
    case "temperature":
      return "#e8b335";
    case "humidity":
      return "#5ba834";
    default:
      return "var(--sw-ink)";
  }
}

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SensorDetailClient from "@/components/sensors/SensorDetailClient";
import { getTimeRangeFrom, isTimeRange, type TimeRange } from "@/lib/metrics";

const DEFAULT_RANGE: TimeRange = "24h";

async function getSensor(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/sensors/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getReadings(id: string, range: TimeRange) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const from = getTimeRangeFrom(range).toISOString();
  const res = await fetch(
    `${baseUrl}/api/sensors/${id}/readings?from=${from}&limit=5000`,
    { cache: "no-store" }
  );
  if (!res.ok) return { readings: [] };
  return res.json();
}

export default async function SensorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range: rangeParam } = await searchParams;
  const range = isTimeRange(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const t = await getTranslations("sensor");
  const [sensor, readingsData] = await Promise.all([
    getSensor(id),
    getReadings(id, range),
  ]);

  if (!sensor) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("notFound")}</h1>
          <Link href="/" className="text-primary underline">
            {t("backToMap")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SensorDetailClient
      sensor={sensor}
      initialReadings={readingsData.readings}
      initialRange={range}
    />
  );
}

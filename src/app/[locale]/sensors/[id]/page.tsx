import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SensorDetailClient from "@/components/sensors/SensorDetailClient";

async function getSensor(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/sensors/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getReadings(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${baseUrl}/api/sensors/${id}/readings?from=${from}&limit=5000`,
    { cache: "no-store" }
  );
  if (!res.ok) return { readings: [] };
  return res.json();
}

export default async function SensorDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("sensor");
  const [sensor, readingsData] = await Promise.all([
    getSensor(id),
    getReadings(id),
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
    />
  );
}

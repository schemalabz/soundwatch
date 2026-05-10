import Link from "next/link";
import { getNoiseLevelColor, getNoiseLevelLabel } from "@/lib/geo";
import { SensorChartSection } from "@/components/sensors/SensorChartSection";

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
  const res = await fetch(`${baseUrl}/api/sensors/${id}/readings?limit=500`, {
    cache: "no-store",
  });
  if (!res.ok) return { readings: [] };
  return res.json();
}

export default async function SensorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sensor, readingsData] = await Promise.all([
    getSensor(id),
    getReadings(id),
  ]);

  if (!sensor) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sensor not found</h1>
          <Link href="/" className="text-blue-600 underline">
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  const dba = sensor.latestReading?.noiseDba;
  const color = dba != null ? getNoiseLevelColor(dba) : "#9ca3af";
  const label = dba != null ? getNoiseLevelLabel(dba) : "No data";

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/" className="text-blue-600 text-sm hover:underline">
        ← Back to map
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-3xl font-bold">
          {sensor.name || sensor.deviceId}
        </h1>
        {sensor.address && (
          <p className="text-gray-500 mt-1">{sensor.address}</p>
        )}
      </div>

      {/* Current readings */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">Noise</p>
          <p className="text-2xl font-bold" style={{ color }}>
            {dba != null ? `${dba.toFixed(1)} dBA` : "—"}
          </p>
          <p className="text-xs" style={{ color }}>
            {label}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">Temperature</p>
          <p className="text-2xl font-bold">
            {sensor.latestReading?.temperature != null
              ? `${sensor.latestReading.temperature.toFixed(1)}°C`
              : "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">Humidity</p>
          <p className="text-2xl font-bold">
            {sensor.latestReading?.humidity != null
              ? `${sensor.latestReading.humidity.toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">PM2.5</p>
          <p className="text-2xl font-bold">
            {sensor.latestReading?.pm25 != null
              ? `${sensor.latestReading.pm25.toFixed(1)}`
              : "—"}
          </p>
        </div>
      </div>

      {/* Chart */}
      <SensorChartSection readings={readingsData.readings} />

      {/* Sensor info */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-bold mb-4">Sensor Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <dt className="text-gray-500">Device ID</dt>
          <dd className="font-mono">{sensor.deviceId}</dd>
          <dt className="text-gray-500">Firmware</dt>
          <dd>{sensor.firmwareVersion || "—"}</dd>
          <dt className="text-gray-500">Reading Interval</dt>
          <dd>{sensor.readingIntervalS}s</dd>
          <dt className="text-gray-500">Last Seen</dt>
          <dd>
            {sensor.lastSeenAt
              ? new Date(sensor.lastSeenAt).toLocaleString()
              : "Never"}
          </dd>
          <dt className="text-gray-500">Coordinates</dt>
          <dd>
            {sensor.latitude != null && sensor.longitude != null
              ? `${sensor.latitude.toFixed(4)}, ${sensor.longitude.toFixed(4)}`
              : "—"}
          </dd>
        </dl>
      </div>
    </div>
  );
}

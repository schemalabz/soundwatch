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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sensor not found</h1>
          <Link href="/" className="text-primary underline">
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  const dba = sensor.latestReading?.noiseDba;
  const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";
  const label = dba != null ? getNoiseLevelLabel(dba) : "No data";
  const r = sensor.latestReading;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        ← Back to map
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          {sensor.name || sensor.deviceId}
        </h1>
        {sensor.address && (
          <p className="text-muted mt-1">{sensor.address}</p>
        )}
      </div>

      {/* Noise — hero metric */}
      <div className="bg-light rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <div>
            <p className="text-sm text-muted">Noise Level</p>
            <p className="text-4xl font-bold" style={{ color }}>
              {dba != null ? `${dba.toFixed(1)} dBA` : "—"}
            </p>
            <p className="text-sm font-semibold" style={{ color }}>
              {label}
            </p>
          </div>
        </div>
      </div>

      {/* Environment */}
      <MetricGroup title="Environment">
        <MetricCard label="Temperature" value={r?.temperature} unit="°C" />
        <MetricCard label="Humidity" value={r?.humidity} unit="%" />
        <MetricCard label="Light" value={r?.lightLux} unit="lux" decimals={0} />
        <MetricCard
          label="Pressure"
          value={r?.pressurePa ? r.pressurePa / 1000 : null}
          unit="kPa"
          decimals={2}
        />
      </MetricGroup>

      {/* UV Radiation */}
      <MetricGroup title="UV Radiation">
        <MetricCard label="UVA" value={r?.uvA} unit="µW/cm²" />
        <MetricCard label="UVB" value={r?.uvB} unit="µW/cm²" />
        <MetricCard label="UVC" value={r?.uvC} unit="µW/cm²" />
      </MetricGroup>

      {/* Air Quality — Mass Concentration */}
      <MetricGroup title="Particulate Matter (mass)">
        <MetricCard label="PM1" value={r?.pm1} unit="µg/m³" />
        <MetricCard label="PM2.5" value={r?.pm25} unit="µg/m³" />
        <MetricCard label="PM4" value={r?.pm4} unit="µg/m³" />
        <MetricCard label="PM10" value={r?.pm10} unit="µg/m³" />
      </MetricGroup>

      {/* Particle Number Concentration */}
      <MetricGroup title="Particle Count (number)">
        <MetricCard label="PN0.5" value={r?.pn05} unit="#/0.1L" decimals={0} />
        <MetricCard label="PN1.0" value={r?.pn10} unit="#/0.1L" decimals={0} />
        <MetricCard label="PN2.5" value={r?.pn25} unit="#/0.1L" decimals={0} />
        <MetricCard label="PN4.0" value={r?.pn40} unit="#/0.1L" decimals={0} />
        <MetricCard label="PN10" value={r?.pn100} unit="#/0.1L" decimals={0} />
        <MetricCard label="Typical Size" value={r?.tps} unit="µm" />
      </MetricGroup>

      {/* Sensor Health */}
      <MetricGroup title="Sensor Health">
        <MetricCard label="Battery" value={r?.battery} unit="%" decimals={0} />
        <MetricCard label="WiFi RSSI" value={r?.rssi} unit="dBm" decimals={0} />
        <MetricCard label="SD Card" value={r?.sdCard} unit="" decimals={0} />
      </MetricGroup>

      {/* Chart */}
      <SensorChartSection readings={readingsData.readings} />

      {/* Sensor info */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-bold mb-4">Sensor Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <dt className="text-muted">Device ID</dt>
          <dd className="font-mono">{sensor.deviceId}</dd>
          <dt className="text-muted">Firmware</dt>
          <dd>{sensor.firmwareVersion || "—"}</dd>
          <dt className="text-muted">Reading Interval</dt>
          <dd>{sensor.readingIntervalS}s</dd>
          <dt className="text-muted">Last Seen</dt>
          <dd>
            {sensor.lastSeenAt
              ? new Date(sensor.lastSeenAt).toLocaleString()
              : "Never"}
          </dd>
          <dt className="text-muted">Coordinates</dt>
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

function MetricGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  color,
  sublabel,
  decimals = 1,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  color?: string;
  sublabel?: string;
  decimals?: number;
}) {
  return (
    <div className="bg-light rounded-xl border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className="text-xl font-bold mt-0.5"
        style={color ? { color } : undefined}
      >
        {value != null ? value.toFixed(decimals) : "—"}
        {value != null && unit && (
          <span className="text-xs font-normal text-muted ml-1">{unit}</span>
        )}
      </p>
      {sublabel && (
        <p
          className="text-xs font-semibold"
          style={color ? { color } : undefined}
        >
          {sublabel}
        </p>
      )}
    </div>
  );
}

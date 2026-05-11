"use client";

import dynamic from "next/dynamic";

const ReadingsChart = dynamic(
  () => import("@/components/sensors/ReadingsChart"),
  { ssr: false }
);

interface Reading {
  recordedAt: string;
  noiseDba: number | null;
  temperature: number | null;
  humidity: number | null;
}

export function SensorChartSection({ readings }: { readings: Reading[] }) {
  return (
    <div className="bg-white rounded-xl border border-border p-6 mb-8">
      <h2 className="text-lg font-bold mb-4">Noise History</h2>
      <ReadingsChart readings={readings} metric="noiseDba" />
    </div>
  );
}

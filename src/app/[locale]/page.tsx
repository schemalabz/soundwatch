"use client";

// Minimal data-freshness dashboard: proves the simulator/ingestion pipeline
// is alive ("last data X seconds ago") and deep ("goes back N days") for all
// 50 sensors. This is scaffolding for pipeline verification, not the product
// UI — the real dashboard replaces this page.

import { useEffect, useState } from "react";

interface FreshnessSensor {
  id: string;
  deviceId: string;
  name: string | null;
  secondsAgo: number | null;
  spanDays: number | null;
  lastLaeq: number | null;
}

interface Freshness {
  now: string;
  fleet: {
    total: number;
    reportingLast60s: number;
    newestSecondsAgo: number | null;
    oldestDataDays: number | null;
  };
  sensors: FreshnessSensor[];
}

const POLL_MS = 5000;

function dotColor(secondsAgo: number | null): string {
  if (secondsAgo == null) return "bg-stone-300";
  if (secondsAgo < 15) return "bg-green-500";
  if (secondsAgo < 120) return "bg-amber-500";
  return "bg-red-500";
}

function ago(secondsAgo: number | null): string {
  if (secondsAgo == null) return "never";
  if (secondsAgo < 90) return `${secondsAgo}s ago`;
  if (secondsAgo < 5400) return `${Math.round(secondsAgo / 60)}m ago`;
  return `${(secondsAgo / 3600).toFixed(1)}h ago`;
}

function span(spanDays: number | null): string {
  if (spanDays == null) return "—";
  if (spanDays < 1) return `${(spanDays * 24).toFixed(1)}h`;
  return `${spanDays.toFixed(1)}d`;
}

export default function FreshnessDashboard() {
  const [data, setData] = useState<Freshness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/freshness", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Freshness;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">
      <h1 className="text-xl font-bold mb-1">Pipeline freshness</h1>
      <p className="text-sm text-stone-500 mb-6">
        Live view of what the ingestion pipeline holds, per sensor. Refreshes every {POLL_MS / 1000}s.
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          Failed to load: {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard label="Sensors" value={String(data.fleet.total)} />
            <StatCard label="Reporting (60s)" value={String(data.fleet.reportingLast60s)} />
            <StatCard label="Newest data" value={ago(data.fleet.newestSecondsAgo)} />
            <StatCard label="History depth" value={span(data.fleet.oldestDataDays)} />
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="py-2 pr-2 font-medium">Sensor</th>
                <th className="py-2 pr-2 font-medium">Last data</th>
                <th className="py-2 pr-2 font-medium text-right">LAeq</th>
                <th className="py-2 font-medium text-right">Goes back</th>
              </tr>
            </thead>
            <tbody>
              {data.sensors.map((s) => (
                <tr key={s.id} className="border-b border-stone-100">
                  <td className="py-1.5 pr-2">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${dotColor(s.secondsAgo)}`} />
                    {s.name ?? s.deviceId}
                    <span className="text-stone-400 ml-2 text-xs">{s.deviceId}</span>
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{ago(s.secondsAgo)}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-right">
                    {s.lastLaeq != null ? `${s.lastLaeq.toFixed(1)} dB` : "—"}
                  </td>
                  <td className="py-1.5 tabular-nums text-right">{span(s.spanDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

        {!data && !error && <p className="text-stone-400 text-sm">Loading…</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 px-4 py-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

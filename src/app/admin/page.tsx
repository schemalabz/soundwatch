"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SensorWithStatus {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  firmwareVersion: string | null;
  readingIntervalS: number;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  status: "online" | "offline" | "never_seen";
}

export default function AdminPage() {
  const [sensors, setSensors] = useState<SensorWithStatus[]>([]);
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

  async function fetchSensors(adminToken: string) {
    const res = await fetch("/api/admin/sensors", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      setError("Authentication failed");
      setAuthenticated(false);
      return;
    }
    const data = await res.json();
    setSensors(data);
    setAuthenticated(true);
    setError("");
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    fetchSensors(token);
  }

  useEffect(() => {
    if (authenticated) {
      const interval = setInterval(() => fetchSensors(token), 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated, token]);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto p-6 mt-20">
        <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="w-full px-4 py-2 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {error && <p className="text-[#ef4444] text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  const online = sensors.filter((s) => s.status === "online").length;
  const offline = sensors.filter((s) => s.status === "offline").length;
  const neverSeen = sensors.filter((s) => s.status === "never_seen").length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-primary text-sm hover:underline">
            ← Back to map
          </Link>
          <h1 className="text-2xl font-bold mt-2">Sensor Admin</h1>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <span className="text-[#22c55e]">{online} online</span>
          <span className="text-[#ef4444]">{offline} offline</span>
          <span className="text-muted">{neverSeen} never seen</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-light border-b border-border">
            <tr>
              <th className="text-left p-3 text-muted font-medium">Status</th>
              <th className="text-left p-3 text-muted font-medium">Device ID</th>
              <th className="text-left p-3 text-muted font-medium">Name</th>
              <th className="text-left p-3 text-muted font-medium">Address</th>
              <th className="text-left p-3 text-muted font-medium">Interval</th>
              <th className="text-left p-3 text-muted font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {sensors.map((sensor) => (
              <tr key={sensor.id} className="border-b border-border/50 hover:bg-light/50 transition-colors">
                <td className="p-3">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      sensor.status === "online"
                        ? "bg-[#22c55e]"
                        : sensor.status === "offline"
                          ? "bg-[#ef4444]"
                          : "bg-[#a8a29e]"
                    }`}
                  />
                </td>
                <td className="p-3 font-mono text-xs">{sensor.deviceId}</td>
                <td className="p-3">{sensor.name || "—"}</td>
                <td className="p-3 text-muted">{sensor.address || "—"}</td>
                <td className="p-3">{sensor.readingIntervalS}s</td>
                <td className="p-3 text-muted">
                  {sensor.lastSeenAt
                    ? new Date(sensor.lastSeenAt).toLocaleString()
                    : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

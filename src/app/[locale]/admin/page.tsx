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
  targetFirmwareVersion: string | null;
  readingIntervalS: number;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  status: "online" | "offline" | "never_seen";
}

interface EditForm {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  readingIntervalS: string;
  targetFirmwareVersion: string;
  isActive: boolean;
}

export default function AdminPage() {
  const [sensors, setSensors] = useState<SensorWithStatus[]>([]);
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [editingSensor, setEditingSensor] = useState<SensorWithStatus | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

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

  function openEdit(sensor: SensorWithStatus) {
    setEditingSensor(sensor);
    setEditForm({
      name: sensor.name || "",
      address: sensor.address || "",
      latitude: sensor.latitude?.toString() || "",
      longitude: sensor.longitude?.toString() || "",
      readingIntervalS: sensor.readingIntervalS.toString(),
      targetFirmwareVersion: sensor.targetFirmwareVersion || "",
      isActive: sensor.isActive,
    });
  }

  async function handleSave() {
    if (!editingSensor || !editForm) return;
    setSaving(true);

    const body: Record<string, unknown> = {
      name: editForm.name || null,
      address: editForm.address || null,
      latitude: editForm.latitude ? parseFloat(editForm.latitude) : null,
      longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
      readingIntervalS: parseInt(editForm.readingIntervalS, 10),
      targetFirmwareVersion: editForm.targetFirmwareVersion || null,
      isActive: editForm.isActive,
    };

    const res = await fetch(`/api/admin/sensors/${editingSensor.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      if (parseInt(editForm.readingIntervalS, 10) !== editingSensor.readingIntervalS) {
        await fetch(`/api/admin/sensors/${editingSensor.id}/config`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            command: "update_config",
            readingIntervalS: parseInt(editForm.readingIntervalS, 10),
          }),
        });
      }
      setEditingSensor(null);
      setEditForm(null);
      fetchSensors(token);
    }

    setSaving(false);
  }

  useEffect(() => {
    if (authenticated) {
      const interval = setInterval(() => fetchSensors(token), 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated, token]);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto p-6 mt-20 w-full">
        <h1 className="sw-h text-[28px] mb-6">Admin Login</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="sw-input"
          />
          {error && <p className="text-[#ef4444] text-sm">{error}</p>}
          <button type="submit" className="sw-btn w-full">
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
    <div className="max-w-6xl mx-auto p-6 w-full overflow-y-auto sw-scroll">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link href="/" className="sw-label text-xs text-muted hover:text-ink">
            ← Back to map
          </Link>
          <h1 className="sw-h text-[28px] mt-2">Sensor Admin</h1>
        </div>
        <div className="flex gap-2 sw-label text-xs">
          <span className="px-2.5 py-1 border-[0.5px] border-hairline rounded" style={{ color: "#5ba834" }}>{online} online</span>
          <span className="px-2.5 py-1 border-[0.5px] border-hairline rounded" style={{ color: "#d6342a" }}>{offline} offline</span>
          <span className="px-2.5 py-1 border-[0.5px] border-hairline rounded">{neverSeen} never seen</span>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 bg-panel rounded-md border-[0.5px] border-hairline overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b-[0.5px] border-hairline">
              <tr className="sw-eyebrow">
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Device ID</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Address</th>
                <th className="text-left p-3">Interval</th>
                <th className="text-left p-3">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((sensor) => (
                <tr
                  key={sensor.id}
                  onClick={() => openEdit(sensor)}
                  className={`border-b-[0.5px] border-hairline last:border-b-0 cursor-pointer transition-colors ${
                    editingSensor?.id === sensor.id
                      ? "bg-[var(--sw-chrome-bg)]"
                      : "hover:bg-[var(--sw-chrome-bg)]"
                  }`}
                >
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

        {editForm && editingSensor && (
          <div className="w-80 bg-panel rounded-md border-[0.5px] border-hairline p-5 space-y-4 self-start">
            <div className="flex items-center justify-between">
              <h3 className="sw-h text-[18px]">Edit Sensor</h3>
              <button
                onClick={() => { setEditingSensor(null); setEditForm(null); }}
                className="text-muted hover:text-ink text-lg"
              >
                ✕
              </button>
            </div>

            <p className="font-mono text-xs text-muted">{editingSensor.deviceId}</p>

            <label className="block">
              <span className="sw-label text-xs">Name</span>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="sw-input mt-1"
              />
            </label>

            <label className="block">
              <span className="sw-label text-xs">Address</span>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="sw-input mt-1"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="sw-label text-xs">Latitude</span>
                <input
                  value={editForm.latitude}
                  onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                  className="sw-input mt-1"
                />
              </label>
              <label className="block">
                <span className="sw-label text-xs">Longitude</span>
                <input
                  value={editForm.longitude}
                  onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                  className="sw-input mt-1"
                />
              </label>
            </div>

            <label className="block">
              <span className="sw-label text-xs">Reading Interval (seconds)</span>
              <input
                type="number"
                value={editForm.readingIntervalS}
                onChange={(e) => setEditForm({ ...editForm, readingIntervalS: e.target.value })}
                className="sw-input mt-1"
              />
            </label>

            <label className="block">
              <span className="sw-label text-xs">Target Firmware Version</span>
              <input
                value={editForm.targetFirmwareVersion}
                onChange={(e) => setEditForm({ ...editForm, targetFirmwareVersion: e.target.value })}
                placeholder="Leave empty for latest"
                className="sw-input mt-1"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="accent-[var(--sw-ink)]"
              />
              <span className="text-sm text-ink">Active</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="sw-btn flex-1"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEditingSensor(null); setEditForm(null); }}
                className="sw-btn-ghost sw-btn"
              >
                Cancel
              </button>
            </div>

            {editingSensor.firmwareVersion && (
              <p className="text-xs text-muted pt-2">
                Current firmware: {editingSensor.firmwareVersion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

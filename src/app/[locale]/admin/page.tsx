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
  stage: "minted" | "in_box" | "installed_live" | "installed_silent";
  hardwareId: string | null;
  apName: string | null;
  provisionedAt: string | null;
  installedAt: string | null;
  isExperimental: boolean;
  plannedLocation: { name: string } | null;
}

const STAGE_BADGE: Record<SensorWithStatus["stage"], { label: string; cls: string }> = {
  minted: { label: "minted", cls: "bg-[#e7e5e4] text-[#57534e]" },
  in_box: { label: "in box", cls: "bg-[#fef3c7] text-[#b45309]" },
  installed_live: { label: "live", cls: "bg-[#dcfce7] text-[#15803d]" },
  installed_silent: { label: "silent", cls: "bg-[#fee2e2] text-[#b91c1c]" },
};

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
  const [showExperimental, setShowExperimental] = useState(false);

  async function fetchSensors(adminToken: string) {
    const res = await fetch("/api/admin/sensors", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      setError("Authentication failed");
      setAuthenticated(false);
      localStorage.removeItem("sw-admin-token");
      return;
    }
    const data = await res.json();
    setSensors(data);
    setAuthenticated(true);
    setError("");
    // Stay logged in across visits; a 401 above clears it again.
    localStorage.setItem("sw-admin-token", adminToken);
  }

  // Auto-login from a previous session. Deferred a microtask so the effect
  // body itself never sets state (react-hooks/set-state-in-effect).
  useEffect(() => {
    const saved = localStorage.getItem("sw-admin-token");
    if (saved) {
      void Promise.resolve().then(() => {
        setToken(saved);
        fetchSensors(saved);
      });
    }
  }, []);

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

  const visibleSensors = sensors.filter((s) => showExperimental || !s.isExperimental);
  const count = (stage: SensorWithStatus["stage"]) =>
    visibleSensors.filter((s) => s.stage === stage).length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-primary text-sm hover:underline">
            ← Back to map
          </Link>
          <h1 className="text-2xl font-bold mt-2">Sensor Admin</h1>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <span className="text-muted">{count("minted")} minted</span>
          <span className="text-[#b45309]">{count("in_box")} in box</span>
          <span className="text-[#22c55e]">{count("installed_live")} live</span>
          <span className="text-[#ef4444]">{count("installed_silent")} silent</span>
          <label className="flex items-center gap-1.5 text-muted font-normal cursor-pointer">
            <input
              type="checkbox"
              checked={showExperimental}
              onChange={(e) => setShowExperimental(e.target.checked)}
              className="rounded border-border"
            />
            show experimental
          </label>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-light border-b border-border">
              <tr>
                <th className="text-left p-3 text-muted font-medium">Stage</th>
                <th className="text-left p-3 text-muted font-medium">Device ID</th>
                <th className="text-left p-3 text-muted font-medium">HW</th>
                <th className="text-left p-3 text-muted font-medium">AP</th>
                <th className="text-left p-3 text-muted font-medium">Site</th>
                <th className="text-left p-3 text-muted font-medium">Name</th>
                <th className="text-left p-3 text-muted font-medium">Interval</th>
                <th className="text-left p-3 text-muted font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {visibleSensors.map((sensor) => (
                <tr
                  key={sensor.id}
                  onClick={() => openEdit(sensor)}
                  className={`border-b border-border/50 cursor-pointer transition-colors ${
                    editingSensor?.id === sensor.id
                      ? "bg-light"
                      : "hover:bg-light/50"
                  }`}
                >
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[sensor.stage].cls}`}
                    >
                      {STAGE_BADGE[sensor.stage].label}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{sensor.deviceId}</td>
                  <td className="p-3 font-mono text-xs">{sensor.hardwareId ? sensor.hardwareId.slice(-4) : "—"}</td>
                  <td className="p-3 text-muted text-xs">{sensor.apName || "—"}</td>
                  <td className="p-3">
                    {sensor.plannedLocation?.name ??
                      (sensor.latitude != null
                        ? <span className="text-[#b45309]">unplanned</span>
                        : "—")}
                  </td>
                  <td className="p-3">{sensor.name || "—"}</td>
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
          <div className="w-80 bg-white rounded-xl border border-border p-5 space-y-4 self-start">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Edit Sensor</h3>
              <button
                onClick={() => { setEditingSensor(null); setEditForm(null); }}
                className="text-muted hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>

            <p className="font-mono text-xs text-muted">{editingSensor.deviceId}</p>

            <div className="text-xs text-muted space-y-1">
              {editingSensor.hardwareId && (
                <p>hardware <span className="font-mono">{editingSensor.hardwareId}</span></p>
              )}
              {editingSensor.apName && <p>setup AP {editingSensor.apName}</p>}
              {editingSensor.provisionedAt && (
                <p>provisioned {new Date(editingSensor.provisionedAt).toLocaleString()}</p>
              )}
              {editingSensor.installedAt && (
                <p>installed {new Date(editingSensor.installedAt).toLocaleString()}</p>
              )}
            </div>

            <label className="block">
              <span className="text-xs text-muted">Name</span>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Address</span>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted">Latitude</span>
                <input
                  value={editForm.latitude}
                  onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Longitude</span>
                <input
                  value={editForm.longitude}
                  onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-muted">Reading Interval (seconds)</span>
              <input
                type="number"
                value={editForm.readingIntervalS}
                onChange={(e) => setEditForm({ ...editForm, readingIntervalS: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Target Firmware Version</span>
              <input
                value={editForm.targetFirmwareVersion}
                onChange={(e) => setEditForm({ ...editForm, targetFirmwareVersion: e.target.value })}
                placeholder="Leave empty for latest"
                className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="rounded border-border"
              />
              <span className="text-sm">Active</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEditingSensor(null); setEditForm(null); }}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-light transition-colors"
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

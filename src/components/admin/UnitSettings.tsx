"use client";

// A unit's settings: name, address and position, whether it shows on the
// public map, reading interval (pushed to the device), firmware target, the
// read-only share link, the label, retire, and the two-phase delete.

import { useRef, useState } from "react";
import DeviceLabel from "@/components/admin/DeviceLabel";
import { ApiError, useAdmin } from "@/components/admin/AdminShell";
import type { UnitDetailResponse } from "@/lib/api/admin";
import { parseLatLon } from "@/lib/api/adminInput";
import { sensorShareUrl } from "@/lib/sensor/api";

export default function UnitSettings({ data, onChanged, notice }: { data: UnitDetailResponse; onChanged: (msg?: string) => void; notice?: string }) {
  const { api } = useAdmin();
  const { unit, identity } = data;
  const initial = {
    name: unit.name ?? "",
    address: unit.address ?? "",
    latitude: unit.latitude?.toString() ?? "",
    longitude: unit.longitude?.toString() ?? "",
    readingIntervalS: String(identity.readingIntervalS),
    targetFirmwareVersion: identity.targetFirmwareVersion ?? "",
    isActive: identity.isActive,
  };
  const [form, setForm] = useState(initial);
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).filter((k) => form[k] !== initial[k]);
  const dirty = changed.length > 0;
  const [msg, setMsg] = useState(notice ?? "");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(false);
  // What this tab just did to the link, until the reload remounts the panel:
  // a fresh URL after Create/Rotate, or null after Revoke. A rotation from
  // another tab shows up on the next reload, which remounts with fresh props.
  const [localShare, setLocalShare] = useState<{ url: string | null } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [del, setDel] = useState<{ readings: number; framelogChunks: number } | null>(null);
  const [delTyped, setDelTyped] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function save() {
    const patch: Record<string, unknown> = {};
    if (changed.includes("name")) patch.name = form.name || null;
    if (changed.includes("address")) patch.address = form.address || null;
    if (changed.includes("targetFirmwareVersion")) patch.targetFirmwareVersion = form.targetFirmwareVersion || null;
    if (changed.includes("isActive")) patch.isActive = form.isActive;
    if (changed.includes("latitude") || changed.includes("longitude")) {
      const at = parseLatLon(Number(form.latitude || "x"), Number(form.longitude || "x"));
      if (!at) { setMsg("Enter both latitude and longitude, as decimal degrees."); return; }
      Object.assign(patch, at);
    }
    const interval = parseInt(form.readingIntervalS, 10);
    if (changed.includes("readingIntervalS")) {
      if (!Number.isFinite(interval) || interval < 1) { setMsg("The interval must be a whole number of seconds."); return; }
      patch.readingIntervalS = interval;
    }
    setBusy(true);
    try {
      await api(`/api/admin/sensors/${unit.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      // The interval only takes effect once the device is told.
      if ("readingIntervalS" in patch) {
        await api(`/api/admin/sensors/${unit.id}/config`, {
          method: "POST",
          body: JSON.stringify({ command: "update_config", readingIntervalS: interval }),
        });
      }
      setMsg("Saved.");
      onChanged("Saved.");
    } catch (e) {
      setMsg((e instanceof ApiError ? (e.body as { error?: string } | null)?.error : null) ?? "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function mintShare(confirmMsg?: string) {
    if (shareBusy || (confirmMsg && !window.confirm(confirmMsg))) return;
    setShareBusy(true);
    try {
      const r = await api<{ shareKey: string; url: string }>(`/api/admin/sensors/${unit.id}/share-key`, { method: "POST" });
      setLocalShare({ url: r.url });
      onChanged();
    } catch { setMsg("Could not create the link."); } finally { setShareBusy(false); }
  }

  async function revokeShare() {
    if (shareBusy || !window.confirm("Revoke the link? Anyone holding it loses access immediately.")) return;
    setShareBusy(true);
    try {
      await api(`/api/admin/sensors/${unit.id}/share-key`, { method: "DELETE" });
      setLocalShare({ url: null });
      onChanged();
    } catch { setMsg("Could not revoke the link."); } finally { setShareBusy(false); }
  }

  // What this tab just did (localShare) wins until the next remount; otherwise
  // derive the link from the prop, which a reload refreshes after a rotation
  // or revocation from another tab.
  const derived = identity.shareKey && typeof window !== "undefined" ? sensorShareUrl(unit.id, identity.shareKey, window.location.origin) : null;
  const currentShareUrl = localShare ? localShare.url : derived;
  const hasShare = localShare ? localShare.url != null : !!identity.shareKey;

  async function copy() {
    if (!currentShareUrl) return;
    try {
      await navigator.clipboard.writeText(currentShareUrl);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg("Copy failed — select the link in the field instead.");
    }
  }

  async function retire(undo: boolean) {
    if (!undo && !window.confirm("Retire this token? It stops counting as a unit; its readings stay. You can undo this.")) return;
    try {
      await api(`/api/admin/sensors/${unit.id}/retire`, { method: "POST", body: JSON.stringify({ undo }) });
      onChanged();
    } catch { setMsg("Could not retire."); }
  }

  // First call is unacknowledged on purpose: the API answers with what would
  // be lost, and only an acknowledged call deletes.
  async function requestDelete() {
    try {
      await api(`/api/admin/sensors/${unit.id}`, { method: "DELETE" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDel((e.body as { wouldDelete: { readings: number; framelogChunks: number } }).wouldDelete);
    }
  }

  async function confirmDelete() {
    try {
      await api(`/api/admin/sensors/${unit.id}`, { method: "DELETE", body: JSON.stringify({ acknowledge: unit.deviceId }) });
      window.location.href = "/admin";
    } catch { setMsg("Could not delete."); }
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal text-ink";
  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-4 rounded-[14px] border border-border bg-white px-[22px] py-5">
      <h3 id="settings-title" className="text-[15px] font-bold text-ink">Settings</h3>
      <label className="text-xs font-medium text-slate">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} /></label>
      <label className="text-xs font-medium text-slate">Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate">Latitude<input inputMode="decimal" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} className={`${input} tabular-nums`} /></label>
        <label className="text-xs font-medium text-slate">Longitude<input inputMode="decimal" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} className={`${input} tabular-nums`} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink" title={unit.retiredAt ? "Retired: undo the retirement to show it again" : undefined}>
        <input type="checkbox" checked={form.isActive} disabled={!!unit.retiredAt} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        Show on the public map
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate">Interval (s)<input inputMode="numeric" value={form.readingIntervalS} onChange={(e) => setForm({ ...form, readingIntervalS: e.target.value })} className={`${input} tabular-nums`} /></label>
        <label className="text-xs font-medium text-slate">Target firmware<input value={form.targetFirmwareVersion} placeholder="latest" onChange={(e) => setForm({ ...form, targetFirmwareVersion: e.target.value })} className={input} /></label>
      </div>
      <button onClick={save} disabled={!dirty || busy} className="h-10 rounded-lg bg-ink text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save changes"}</button>
      {msg && <p role="status" className="text-xs text-slate">{msg}</p>}

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold text-ink">Live page link</p>
        <p className="text-xs text-slate">Read-only access to this unit’s page, for someone without the admin token. Rotate it if it leaks.</p>
        {hasShare ? (
          <>
            <div className="flex gap-1.5">
              <input readOnly value={currentShareUrl ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-2 py-1.5 font-mono text-[11px]" />
              <button onClick={copy} className="rounded-lg bg-ink px-3 text-xs font-semibold text-white">{copied ? "Copied" : "Copy"}</button>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => mintShare("Rotate the link? The current link stops working immediately.")} disabled={shareBusy} className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40">Rotate</button>
              <button onClick={revokeShare} disabled={shareBusy} className="rounded-lg border border-[#e6c3bf] px-3 py-1.5 text-xs text-loud disabled:opacity-40">Revoke</button>
            </div>
          </>
        ) : (
          <button onClick={() => mintShare()} disabled={shareBusy} className="h-9 rounded-lg border border-silver text-xs font-semibold text-ink disabled:opacity-40">Create link</button>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setLabel(true)} disabled={!unit.apName} title={unit.apName ? "Print label" : "Provision first — the label needs the setup name"} className="h-10 flex-1 rounded-lg border border-silver text-sm font-semibold text-ink disabled:opacity-40">Print label</button>
        {unit.retiredAt ? (
          <button onClick={() => retire(true)} className="h-10 flex-1 rounded-lg border border-silver text-sm font-semibold text-ink">Un-retire</button>
        ) : (
          <button onClick={() => retire(false)} className="h-10 flex-1 rounded-lg border border-[#e6c3bf] text-sm font-semibold text-loud">Retire token</button>
        )}
      </div>

      {del === null ? (
        <button onClick={requestDelete} className="w-fit text-xs text-loud underline">Delete permanently…</button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-[#fca5a5] bg-[#fef2f2] p-3">
          <p className="text-sm font-medium text-[#b91c1c]">
            Permanently deletes {del.readings.toLocaleString("en")} readings{del.framelogChunks > 0 ? ` and ${del.framelogChunks.toLocaleString("en")} framelog chunks` : ""}. Retiring keeps them.
          </p>
          <label className="text-xs text-[#7f1d1d]">
            Type the last 4 characters of <span className="font-mono">{unit.deviceId}</span> to confirm
            <input value={delTyped} onChange={(e) => setDelTyped(e.target.value)} className="mt-1 w-full rounded-lg border border-[#fca5a5] bg-white px-3 py-1.5 font-mono text-sm" />
          </label>
          <div className="flex gap-2">
            <button onClick={confirmDelete} disabled={delTyped !== unit.deviceId.slice(-4)} className="flex-1 rounded-lg bg-[#b91c1c] py-2 text-sm font-semibold text-white disabled:opacity-40">Delete permanently</button>
            <button onClick={() => { setDel(null); setDelTyped(""); }} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {label && (
        <DeviceLabel sensor={{ deviceId: unit.deviceId, name: unit.name, apName: unit.apName, hardwareId: identity.hardwareId }} onClose={() => setLabel(false)} />
      )}
    </section>
  );
}

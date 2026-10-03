"use client";

// "Link this unit to a site" — a planned site from a list sorted by distance
// from the unit's GPS, or a custom address. Design canvas: Locate.dc.html.
// Opened from the Sites page (unlinked units) and from the unit page.

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, useAdmin } from "@/components/admin/AdminShell";
import type { AdminSite } from "@/lib/api/admin";
import { parseLatLon } from "@/lib/api/adminInput";
import { distanceMeters } from "@/lib/geo";

export interface LinkTarget {
  id: string;
  apName: string | null;
  deviceId: string;
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  address: string | null;
}

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export default function LinkSiteDialog({
  unit,
  sites,
  onClose,
  onLinked,
}: {
  unit: LinkTarget;
  sites: AdminSite[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const { api } = useAdmin();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"site" | "custom">("site");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState({
    name: unit.name ?? "",
    address: unit.address ?? "",
    latitude: unit.latitude?.toString() ?? "",
    longitude: unit.longitude?.toString() ?? "",
  });
  const [movePin, setMovePin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const ranked = useMemo(() => {
    const here = unit.latitude != null && unit.longitude != null ? { latitude: unit.latitude, longitude: unit.longitude } : null;
    const needle = q.trim().toLowerCase();
    return sites
      .filter((s) => s.isActive)
      .filter((s) => !needle || `${s.name} ${s.address ?? ""}`.toLowerCase().includes(needle))
      .map((s) => ({ s, d: here ? distanceMeters(here, s) : null, others: s.units.filter((u) => u.id !== unit.id) }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.s.name.localeCompare(b.s.name, "el"));
  }, [sites, unit, q]);

  // Pre-pick the nearest free site within 150 m: the common case (a unit
  // installed by GPS at a known store) becomes one click. Not wider — the
  // Εξάρχεια unit sits 288 m from a different store's site (Τζαβέλλα), and a
  // pre-picked wrong store is worse than no pick. Phone GPS indoors was ~100 m
  // off at Δάφνη.
  const suggested = ranked.find((r) => r.d != null && r.d < 150 && r.others.length === 0)?.s.id ?? null;
  const chosenId = picked ?? suggested;
  const chosen = ranked.find((r) => r.s.id === chosenId);
  const occupied = (chosen?.others.length ?? 0) > 0;

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (mode === "site") {
        if (!chosen) { setError("Pick a site."); return; }
        await api(`/api/admin/sensors/${unit.id}/site`, {
          method: "POST",
          body: JSON.stringify({ siteId: chosen.s.id, acceptOccupied: occupied, movePin }),
        });
      } else {
        const at = parseLatLon(Number(custom.latitude), Number(custom.longitude));
        if (!custom.latitude.trim() || !custom.longitude.trim() || !at) { setError("Enter the latitude and longitude."); return; }
        await api(`/api/admin/sensors/${unit.id}/site`, {
          method: "POST",
          body: JSON.stringify({ custom: { name: custom.name, address: custom.address || null, ...at } }),
        });
      }
      onLinked();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body as { error?: string } | null)?.error : null;
      setError(msg ?? "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const box = unit.apName ?? unit.deviceId;
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="link-title"
      className="m-auto w-[min(760px,calc(100vw-32px))] rounded-2xl p-0 shadow-[0_24px_60px_rgba(20,22,30,0.35)] backdrop:bg-[#2d3142]/60"
    >
      <div className="flex flex-col gap-1.5 border-b border-border px-7 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <h2 id="link-title" className="flex-1 text-[22px] font-bold text-ink">
            Link <span className="font-mono text-xl">{box}</span> to a site
          </h2>
          <button onClick={() => dialogRef.current?.close()} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <span className="text-sm text-slate">
          {unit.latitude != null
            ? `The unit reported GPS ${unit.latitude.toFixed(5)}, ${unit.longitude!.toFixed(5)} at install. Sites are sorted by distance from that point.`
            : "The unit has no GPS position; sites are sorted by name."}
        </span>
      </div>

      <div className="px-7 pt-4">
        <div role="tablist" aria-label="Location source" className="inline-flex gap-1 rounded-[10px] bg-[#f0f1f3] p-1">
          {(["site", "custom"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`h-9 rounded-[7px] px-4 text-sm font-semibold text-ink ${mode === m ? "bg-white" : ""}`}
            >
              {m === "site" ? "Planned site" : "Custom address"}
            </button>
          ))}
        </div>
      </div>

      {mode === "site" ? (
        <div className="flex flex-col gap-2 px-7 pb-2 pt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search sites"
            placeholder="Search by store, street or area"
            className="h-[42px] rounded-[10px] border border-[#d5d7db] px-3 text-sm"
          />
          <div role="radiogroup" aria-label="Sites" className="max-h-[340px] overflow-y-auto rounded-xl border border-border">
            {ranked.length === 0 && <p className="px-4 py-3 text-sm text-slate">No sites yet — add one on the Sites page, or use a custom address.</p>}
            {ranked.map(({ s, d, others }) => {
              const on = s.id === chosenId;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(s.id)}
                  className={`flex w-full items-center gap-3.5 border-b border-[#eef0f2] px-4 py-3 text-left ${on ? "bg-[#fdf3ee] shadow-[inset_3px_0_0_var(--sw-sound)]" : "bg-white"}`}
                >
                  <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-sound" : "border-silver"}`}>
                    <span className={`size-2 rounded-full ${on ? "bg-sound" : ""}`} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-ink">{s.name}{s.address ? ` · ${s.address}` : ""}</span>
                    <span className={`text-[13px] ${others.length ? "text-[#96620f]" : "text-slate"}`}>
                      {others.length
                        ? `Has ${others.map((u) => `${u.apName?.replace(/^Soundwatch-/, "") ?? u.deviceId.slice(0, 8)} (${u.status})`).join(", ")} — linking adds this unit beside it`
                        : "No unit linked yet"}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink">{d != null ? fmtDistance(d) : ""}</span>
                </button>
              );
            })}
          </div>
          {chosen && chosen.d != null && (
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={movePin} onChange={(e) => setMovePin(e.target.checked)} />
              Move the pin to the site’s position (the unit’s GPS is {Math.round(chosen.d)} m away)
            </label>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-7 pb-2 pt-4">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            Display name
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} className="h-[42px] rounded-[10px] border border-[#d5d7db] px-3 text-sm font-normal" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            Address
            <input value={custom.address} onChange={(e) => setCustom({ ...custom, address: e.target.value })} className="h-[42px] rounded-[10px] border border-[#d5d7db] px-3 text-sm font-normal" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Latitude
              <input inputMode="decimal" value={custom.latitude} onChange={(e) => setCustom({ ...custom, latitude: e.target.value })} className="h-[42px] rounded-[10px] border border-[#d5d7db] px-3 text-sm font-normal tabular-nums" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Longitude
              <input inputMode="decimal" value={custom.longitude} onChange={(e) => setCustom({ ...custom, longitude: e.target.value })} className="h-[42px] rounded-[10px] border border-[#d5d7db] px-3 text-sm font-normal tabular-nums" />
            </label>
          </div>
          <span className="text-[13px] text-slate">A custom address is an unplanned install: it shows on the map but is not one of the target sites.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-7 pb-6 pt-4">
        <span className="min-w-0 flex-1 text-[13px] text-slate" role={error ? "alert" : undefined}>
          {error || (mode === "site" ? "Copies the site’s name and address onto the unit. The install date stays as it is." : "Only the location changes; the install date stays.")}
        </span>
        <button onClick={() => dialogRef.current?.close()} className="h-11 rounded-[10px] border border-silver px-[18px] text-sm font-semibold text-ink">Cancel</button>
        <button
          onClick={save}
          disabled={busy || (mode === "site" && !chosen) || (mode === "custom" && (!custom.name.trim() || !parseLatLon(Number(custom.latitude.trim() || "x"), Number(custom.longitude.trim() || "x"))))}
          className="h-11 rounded-[10px] bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {mode === "custom" ? "Save location" : occupied ? "Link beside the existing unit" : "Link to site"}
        </button>
      </div>
    </dialog>
  );
}

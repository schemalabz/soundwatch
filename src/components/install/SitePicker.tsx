"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { installStrings as tr } from "@/lib/strings/install";
import { ATHENS_CENTER, distanceMeters } from "@/lib/geo";
import { suggestAddress } from "@/lib/dashboard/geocode";
import MapPinPicker from "./MapPinPicker";

// The install page's location step. Three paths, in order of preference:
// GPS-sorted nearest sites -> full searchable list (GPS is optional by
// design) -> map-pin drop for an unplanned spot. Never auto-binds: the
// nearest site is highlighted, but saving always takes an explicit tap.

type Site = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  occupied: null | { state: "live" | "silent" };
};

type Gps = { latitude: number; longitude: number };

// Primary action: solid brand orange, thumb-sized. The old confirm was styled
// like the site cards above it (white + gray border) and did not read as a
// button at all — outdoors, on a phone, the action must be unmissable.
const primaryBtn = {
  font: "inherit", fontSize: 17, fontWeight: 700, padding: "14px 18px",
  minHeight: 52, borderRadius: 12, border: "none", width: "100%",
  background: "var(--primary, #c2410c)", color: "#fff", cursor: "pointer",
} as const;

// Caution variant: amber = "you are overriding something" (occupied site,
// force relocation) — the color carries the warning, not just the label.
const cautionBtn = { ...primaryBtn, background: "#b45309" } as const;

const linkBtn = {
  font: "inherit", fontSize: 16, border: "none", background: "none",
  color: "#2563eb", textDecoration: "underline", padding: "6px 0", cursor: "pointer",
} as const;

const fieldLabel = { display: "block", fontSize: 14, fontWeight: 600, margin: "0 0 10px" } as const;

// 16 px input text stops iOS from zooming the page on focus.
const fieldInput = {
  font: "inherit", fontSize: 16, width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid #ccc", boxSizing: "border-box", marginTop: 4, fontWeight: 400,
} as const;

// Keeps the confirm reachable when "show all" makes the list taller than the
// viewport: the action sticks to the bottom edge with a white fade behind it.
const stickyBar = {
  position: "sticky" as const, bottom: 0, paddingTop: 14, paddingBottom: 8,
  background: "linear-gradient(to top, #fff 75%, rgba(255,255,255,0))",
};

export default function SitePicker({
  token,
  onSaved,
  pinOnly = false,
}: {
  token: string;
  onSaved: () => void;
  // Bench/experimental units: same flow, but the planned-site list is never
  // offered — bench hardware must not occupy a real deployment site. The pin
  // is the whole flow for them.
  pinOnly?: boolean;
}) {
  const [sites, setSites] = useState<Site[] | null>(pinOnly ? [] : null);
  const [gps, setGps] = useState<Gps | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pinMode, setPinMode] = useState(pinOnly);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsForce, setNeedsForce] = useState(false);
  const [pending, setPending] = useState<{ latitude: number; longitude: number } | null>(null);
  const [suggestion, setSuggestion] = useState<{ looking: boolean; found: boolean }>({ looking: false, found: false });
  const [address, setAddress] = useState("");
  // Guards against a slow suggestAddress for an abandoned pin resolving after
  // the installer went back to the map and picked another pin, which would
  // otherwise overwrite the new pin's suggestion with the stale one.
  const lookupSeq = useRef(0);

  async function pinPicked(c: { latitude: number; longitude: number }) {
    const seq = ++lookupSeq.current;
    setPending(c);
    setSuggestion({ looking: true, found: false });
    const s = await suggestAddress(c.longitude, c.latitude);
    if (seq !== lookupSeq.current) return;
    setAddress(s ?? "");
    setSuggestion({ looking: false, found: s != null });
  }

  useEffect(() => {
    if (!pinOnly) {
      fetch(`/api/install/${token}/locations`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setSites(j.locations ?? []))
        .catch(() => setSites([]));
    }
    // GPS denial or timeout is silent — the list is the flow, not a fallback.
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [token, pinOnly]);

  const ordered = useMemo(() => {
    if (!sites) return [];
    const filtered = search
      ? sites.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
      : sites;
    if (!gps) return filtered; // API order: alphabetical
    return [...filtered].sort((a, b) => distanceMeters(gps, a) - distanceMeters(gps, b));
  }, [sites, gps, search]);

  const visible = showAll || search ? ordered : ordered.slice(0, 5);
  const selected = ordered.find((s) => s.id === selectedId) ?? null;

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/install/${token}/location`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (r.ok) {
        onSaved();
      } else if (r.status === 409 && j.error === "already located") {
        setNeedsForce(true);
        setMsg(tr.alreadyLocated);
      } else {
        setMsg(j.detail ?? j.error ?? tr.saveFailed);
      }
    } catch {
      setMsg(tr.networkError);
    } finally {
      setBusy(false);
    }
  }

  function confirmSite(site: Site) {
    save({
      latitude: site.latitude,
      longitude: site.longitude,
      plannedLocationId: site.id,
      ...(site.occupied ? { acceptOccupied: true } : {}),
      ...(needsForce ? { force: true } : {}),
    });
  }

  if (sites === null) return <p style={{ fontSize: 14, color: "#666" }}>{tr.loadingSites}</p>;

  if (pinMode) {
    const center = gps ?? (selected
      ? { latitude: selected.latitude, longitude: selected.longitude }
      : { latitude: ATHENS_CENTER.lat, longitude: ATHENS_CENTER.lng });
    if (pending) {
      return (
        <div>
          <h3 style={{ fontSize: 16, margin: "0 0 6px" }}>{tr.addressTitle}</h3>
          <p style={{ fontSize: 14, color: "#444", margin: "0 0 10px" }}>
            {suggestion.looking ? tr.lookingUpAddress : suggestion.found ? tr.addressHint : tr.addressNotFound}
          </p>
          <label style={fieldLabel}>{tr.addressLabel}
            <input style={fieldInput} value={address} maxLength={200} disabled={suggestion.looking}
              onChange={(e) => setAddress(e.target.value)} />
          </label>
          {msg && <p style={{ fontSize: 14, marginTop: 8, color: "#b45309" }}>{msg}</p>}
          <button style={{ ...(needsForce ? cautionBtn : primaryBtn), ...(busy || suggestion.looking ? { opacity: 0.6, cursor: "wait" } : {}) }}
            disabled={busy || suggestion.looking}
            onClick={() => save({ ...pending, ...(address.trim() ? { address: address.trim() } : {}),
              ...(needsForce ? { force: true } : {}) })}>
            {busy ? tr.saving : needsForce ? tr.overrideLocation : tr.saveAddress}
          </button>
          <p style={{ marginTop: 10 }}>
            <button style={linkBtn} onClick={() => { lookupSeq.current++; setPending(null); setMsg(null); }}>{tr.backToMap}</button>
          </p>
        </div>
      );
    }
    return (
      <div>
        <p style={{ fontSize: 14, color: "#444", margin: "0 0 8px" }}>{tr.movePin}</p>
        <MapPinPicker
          center={center}
          confirmLabel={busy ? tr.saving : tr.pinConfirm}
          busy={busy}
          onConfirm={pinPicked}
        />
        {msg && <p style={{ fontSize: 14, marginTop: 8, color: "#b45309" }}>{msg}</p>}
        {!pinOnly && (
          <p style={{ marginTop: 10 }}>
            <button style={linkBtn} onClick={() => setPinMode(false)}>{tr.backToList}</button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {sites.length > 3 && (
        <input
          style={{ font: "inherit", fontSize: 15, width: "100%", padding: "10px 12px",
                   borderRadius: 10, border: "1px solid #ccc", boxSizing: "border-box",
                   marginBottom: 10 }}
          placeholder={tr.searchSites}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((site, i) => {
          const isNearest = gps != null && !search && i === 0;
          const isSelected = selectedId === site.id;
          return (
            <button
              key={site.id}
              onClick={() => { setSelectedId(site.id); setMsg(null); }}
              style={{
                font: "inherit", fontSize: 16, textAlign: "left", padding: "14px", borderRadius: 12,
                cursor: "pointer",
                background: isSelected ? "#fff7ed" : "#fff",
                border: isSelected ? "2px solid var(--primary, #c2410c)" : isNearest ? "2px solid #fdba74" : "1px solid #ccc",
                opacity: site.occupied && !isSelected ? 0.65 : 1,
              }}
            >
              {isSelected && <span style={{ color: "var(--primary, #c2410c)", fontWeight: 700 }}>✓ </span>}
              <span style={{ fontWeight: 600 }}>{site.name}</span>
              {gps && (
                <span style={{ color: "#666" }}>{tr.metersAway(Math.round(distanceMeters(gps, site)))}</span>
              )}
              {site.occupied && (
                <span style={{ display: "block", fontSize: 13, color: "#b45309" }}>
                  {site.occupied.state === "live" ? tr.occupiedLive : tr.occupiedSilent}
                </span>
              )}
              {site.address && (
                <span style={{ display: "block", fontSize: 13, color: "#666" }}>{site.address}</span>
              )}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p style={{ fontSize: 14, color: "#666", margin: 0 }}>{tr.noSitesMatch}</p>
        )}
      </div>
      {!showAll && !search && ordered.length > 5 && (
        <p style={{ marginTop: 8 }}>
          <button style={linkBtn} onClick={() => setShowAll(true)}>
            {tr.showAll(ordered.length)}
          </button>
        </p>
      )}
      {selected && (
        <div style={stickyBar}>
          {selected.occupied && (
            <p style={{ fontSize: 14, color: "#b45309", margin: "0 0 8px" }}>
              {tr.occupiedWarning(selected.occupied.state)}
            </p>
          )}
          {msg && <p style={{ fontSize: 14, color: "#b45309", margin: "0 0 8px" }}>{msg}</p>}
          <button
            style={{
              ...(needsForce || selected.occupied ? cautionBtn : primaryBtn),
              ...(busy ? { opacity: 0.6, cursor: "wait" } : {}),
            }}
            disabled={busy}
            onClick={() => confirmSite(selected)}
          >
            {busy ? tr.saving
              : needsForce ? tr.overrideLocation
              : selected.occupied ? tr.installAnyway
              : tr.confirmSite(selected.name)}
          </button>
        </div>
      )}
      <p style={{ marginTop: 12 }}>
        <button style={linkBtn} onClick={() => { setPinMode(true); setMsg(null); }}>
          {tr.somewhereElse}
        </button>
      </p>
    </div>
  );
}

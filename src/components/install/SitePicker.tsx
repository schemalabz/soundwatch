"use client";

import { useEffect, useMemo, useState } from "react";
import { ATHENS_CENTER, distanceMeters } from "@/lib/geo";
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

const btn = {
  font: "inherit", fontSize: 16, padding: "12px 18px", borderRadius: 10,
  border: "1px solid #ccc", background: "#fff", width: "100%",
} as const;

const linkBtn = {
  font: "inherit", fontSize: 14, border: "none", background: "none",
  color: "#2563eb", textDecoration: "underline", padding: 0, cursor: "pointer",
} as const;

export default function SitePicker({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [gps, setGps] = useState<Gps | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsForce, setNeedsForce] = useState(false);

  useEffect(() => {
    fetch(`/api/install/${token}/locations`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSites(j.locations ?? []))
      .catch(() => setSites([]));
    // GPS denial or timeout is silent — the list is the flow, not a fallback.
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [token]);

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
        setMsg("This device already has a location. Save again only if you are sure this is the right box.");
      } else {
        setMsg(j.detail ?? j.error ?? "Could not save location.");
      }
    } catch {
      setMsg("Network error — try again.");
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

  if (sites === null) return <p style={{ fontSize: 14, color: "#666" }}>Loading sites…</p>;

  if (pinMode) {
    const center = gps ?? (selected
      ? { latitude: selected.latitude, longitude: selected.longitude }
      : { latitude: ATHENS_CENTER.lat, longitude: ATHENS_CENTER.lng });
    return (
      <div>
        <p style={{ fontSize: 14, color: "#444", margin: "0 0 8px" }}>
          Move the map until the pin is where the unit is, then confirm.
        </p>
        <MapPinPicker
          center={center}
          confirmLabel={busy ? "Saving…" : "This is where the unit is"}
          onConfirm={(c) => save({ ...c, ...(needsForce ? { force: true } : {}) })}
        />
        {msg && <p style={{ fontSize: 14, marginTop: 8, color: "#b45309" }}>{msg}</p>}
        <p style={{ marginTop: 10 }}>
          <button style={linkBtn} onClick={() => setPinMode(false)}>← Back to the site list</button>
        </p>
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
          placeholder="Search sites…"
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
                font: "inherit", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                background: "#fff", cursor: "pointer",
                border: isSelected ? "2px solid #2563eb" : isNearest ? "2px solid #93c5fd" : "1px solid #ccc",
                opacity: site.occupied ? 0.65 : 1,
              }}
            >
              <span style={{ fontWeight: 600 }}>{site.name}</span>
              {gps && (
                <span style={{ color: "#666" }}> — {Math.round(distanceMeters(gps, site))} m</span>
              )}
              {site.occupied && (
                <span style={{ display: "block", fontSize: 13, color: "#b45309" }}>
                  already has a unit ({site.occupied.state})
                </span>
              )}
              {site.address && (
                <span style={{ display: "block", fontSize: 13, color: "#666" }}>{site.address}</span>
              )}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p style={{ fontSize: 14, color: "#666", margin: 0 }}>No sites match.</p>
        )}
      </div>
      {!showAll && !search && ordered.length > 5 && (
        <p style={{ marginTop: 8 }}>
          <button style={linkBtn} onClick={() => setShowAll(true)}>
            Show all {ordered.length} sites
          </button>
        </p>
      )}
      {selected && (
        <div style={{ marginTop: 12 }}>
          {selected.occupied && (
            <p style={{ fontSize: 14, color: "#b45309", margin: "0 0 8px" }}>
              This site already has a unit ({selected.occupied.state}). Continue only if you are
              replacing it.
            </p>
          )}
          {msg && <p style={{ fontSize: 14, color: "#b45309", margin: "0 0 8px" }}>{msg}</p>}
          <button style={btn} disabled={busy} onClick={() => confirmSite(selected)}>
            {busy ? "Saving…"
              : needsForce ? "Override location"
              : selected.occupied ? "Install here anyway"
              : `Confirm: ${selected.name}`}
          </button>
        </div>
      )}
      <p style={{ marginTop: 12 }}>
        <button style={linkBtn} onClick={() => { setPinMode(true); setMsg(null); }}>
          I&apos;m somewhere else
        </button>
      </p>
    </div>
  );
}

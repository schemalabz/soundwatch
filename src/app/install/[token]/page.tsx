"use client";

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { installStrings as tr } from "@/lib/strings/install";
import SitePicker from "@/components/install/SitePicker";

// Installer-facing page, reached by scanning the QR on the box. Three jobs:
// identify the unit, capture where it ended up, and prove it is actually
// publishing before the installer leaves. Deliberately plain: it is read on a
// phone, outdoors, possibly on mobile data, by someone who does not work here.

type Status = {
  token: string; known: boolean; state: "live" | "stale" | "never_seen" | "unknown_token";
  live?: boolean; hasLocation?: boolean;
  sensor?: { name: string | null; hardwareId: string | null; apName: string | null;
             address: string | null; latitude: number | null; longitude: number | null;
             isExperimental?: boolean };
  lastReading?: { secondsAgo: number; laeq: number | null; battery: number | null;
                  rssi: number | null } | null;
};

export default function InstallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/install/${token}/status`, { cache: "no-store" });
      setS(await r.json());
    } catch { /* offline on site is normal; keep the last state */ }
  }, [token]);

  // Poll while the installer is on the page — the whole point is that they watch
  // it turn green rather than assume it will. First poll is deferred a microtask
  // so the effect body itself never sets state (react-hooks/set-state-in-effect).
  useEffect(() => {
    const i = setInterval(load, 5000);
    void Promise.resolve().then(load);
    return () => clearInterval(i);
  }, [load]);

  async function saveLocation(force = false) {
    setBusy(true); setMsg(null);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000 })
      );
      const r = await fetch(`/api/install/${token}/location`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, force }),
      });
      const j = await r.json();
      if (r.ok) { setMsg(tr.locationSaved); load(); }
      else if (r.status === 409) setMsg(tr.alreadyLocated);
      else setMsg(j.error ?? tr.saveFailed);
    } catch {
      setMsg(tr.gpsFailed);
    } finally { setBusy(false); }
  }

  const st = s?.state;
  const tone = st === "live" ? "#0ca30c" : st === "stale" ? "#fab219" : "#d03b3b";
  const headline =
    st === "live" ? tr.live :
    st === "stale" ? tr.stale :
    st === "never_seen" ? tr.neverSeen :
    st === "unknown_token" ? tr.unknownToken : tr.checking;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 20,
                   font: "16px/1.5 system-ui, -apple-system, sans-serif" }}>
      <p style={{ color: "#666", margin: 0 }}>{tr.title}</p>
      <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>{tr.device(token)}</h1>
      {s?.sensor?.hardwareId && (
        <p style={{ color: "#666", margin: 0, fontSize: 13 }}>
          {tr.hardwareLine(s.sensor.hardwareId.slice(0, 8) + "…")}
          {s.sensor.apName ? tr.setupNetwork(s.sensor.apName) : ""}
        </p>
      )}

      <div style={{ border: `2px solid ${tone}`, borderRadius: 12, padding: 16, margin: "18px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 650, color: tone }}>{headline}</div>
        {s?.lastReading && (
          <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>
            {tr.lastReading(s.lastReading.secondsAgo)}
            {s.lastReading.laeq != null && <> · {s.lastReading.laeq.toFixed(1)} dB</>}
            {s.lastReading.battery != null && tr.battery(s.lastReading.battery)}
            {s.lastReading.rssi != null && tr.wifi(s.lastReading.rssi)}
          </div>
        )}
        {st === "never_seen" && (
          <ol style={{ fontSize: 14, color: "#444", marginTop: 10, paddingLeft: 20 }}>
            <li>Ενεργοποιήστε τη μονάδα — το φωτάκι πρέπει να αναβοσβήνει <b>κόκκινο</b> (λειτουργία εγκατάστασης).</li>
            <li>
              Συνδεθείτε στο WiFi της{s?.sensor?.apName ? <> — <b>{s.sensor.apName}</b></> : " (Soundwatch-…)"} και
              καταχωρίστε το WiFi του χώρου. Αν δεν ανοίξει μόνη της η σελίδα ρυθμίσεων, πληκτρολογήστε{" "}
              <b>http://192.168.1.1</b>.
            </li>
            <li><b>Μην αλλάξετε το πεδίο token</b> αν εμφανίζεται στη σελίδα ρυθμίσεων.</li>
            <li>{tr.step4}</li>
          </ol>
        )}
        {st === "stale" && (
          <p style={{ fontSize: 14, color: "#444", marginTop: 10 }}>{tr.staleHint}</p>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>{tr.whereInstalled}</h2>
      {s?.hasLocation ? (
        <>
          <p style={{ fontSize: 14, color: "#444" }}>
            {tr.recorded}{ s.sensor?.address ? `: ${s.sensor.address}` : "" }
            {s.sensor?.latitude != null && <> ({s.sensor.latitude.toFixed(5)}, {s.sensor!.longitude!.toFixed(5)})</>}
            {s.sensor?.name ? <> — <b>{s.sensor.name}</b></> : null}
          </p>
          <button onClick={() => saveLocation(true)} disabled={busy}
            style={{ font: "inherit", fontSize: 17, fontWeight: 700, padding: "14px 18px",
                     minHeight: 52, borderRadius: 12, border: "none", width: "100%",
                     background: "#b45309", color: "#fff", cursor: "pointer",
                     ...(busy ? { opacity: 0.6, cursor: "wait" } : {}) }}>
            {busy ? tr.saving : tr.updateHere}
          </button>
          {msg && <p style={{ fontSize: 14, marginTop: 10 }}>{msg}</p>}
        </>
      ) : s ? (
        // Mounted only once the status is known: pinOnly must be right at
        // mount, because it seeds the picker's initial mode.
        <>
          {!s.sensor?.isExperimental && <p style={{ fontSize: 14, color: "#444" }}>{tr.pickSite}</p>}
          <SitePicker token={token} onSaved={load} pinOnly={s.sensor?.isExperimental === true} />
        </>
      ) : (
        <p style={{ fontSize: 14, color: "#666" }}>{tr.checking}</p>
      )}

      <p style={{ fontSize: 13, color: "#666", marginTop: 24 }}>
        <>Μην φύγετε πριν αυτή η σελίδα δείξει <b>Λαμβάνουμε δεδομένα</b>.</>
      </p>
    </main>
  );
}

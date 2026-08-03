"use client";

import { useCallback, useEffect, useState } from "react";
import { use } from "react";

// Installer-facing page, reached by scanning the QR on the box. Three jobs:
// identify the unit, capture where it ended up, and prove it is actually
// publishing before the installer leaves. Deliberately plain: it is read on a
// phone, outdoors, possibly on mobile data, by someone who does not work here.

type Status = {
  token: string; known: boolean; state: "live" | "stale" | "never_seen" | "unknown_token";
  live?: boolean; hasLocation?: boolean;
  sensor?: { name: string | null; hardwareId: string | null; apName: string | null;
             address: string | null; latitude: number | null; longitude: number | null };
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
  // it turn green rather than assume it will.
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

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
      if (r.ok) { setMsg("Location saved."); load(); }
      else if (r.status === 409) setMsg("This device already has a location. Only override if you are sure this is the right box.");
      else setMsg(j.error ?? "Could not save location.");
    } catch {
      setMsg("Could not read GPS. Allow location access, or report the address by hand.");
    } finally { setBusy(false); }
  }

  const st = s?.state;
  const tone = st === "live" ? "#0ca30c" : st === "stale" ? "#fab219" : "#d03b3b";
  const headline =
    st === "live" ? "✓ Receiving data" :
    st === "stale" ? "⚠ Was working, now silent" :
    st === "never_seen" ? "… Not reporting yet" :
    st === "unknown_token" ? "✕ Unknown device" : "Checking…";

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 20,
                   font: "16px/1.5 system-ui, -apple-system, sans-serif" }}>
      <p style={{ color: "#666", margin: 0 }}>Soundwatch install</p>
      <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>Device {token}</h1>
      {s?.sensor?.hardwareId && (
        <p style={{ color: "#666", margin: 0, fontSize: 13 }}>
          hardware {s.sensor.hardwareId.slice(0, 8)}…
          {s.sensor.apName ? ` · setup network ${s.sensor.apName}` : ""}
        </p>
      )}

      <div style={{ border: `2px solid ${tone}`, borderRadius: 12, padding: 16, margin: "18px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 650, color: tone }}>{headline}</div>
        {s?.lastReading && (
          <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>
            last reading {s.lastReading.secondsAgo}s ago
            {s.lastReading.laeq != null && <> · {s.lastReading.laeq.toFixed(1)} dB</>}
            {s.lastReading.battery != null && <> · battery {s.lastReading.battery}%</>}
            {s.lastReading.rssi != null && <> · wifi {s.lastReading.rssi} dBm</>}
          </div>
        )}
        {st === "never_seen" && (
          <ol style={{ fontSize: 14, color: "#444", marginTop: 10, paddingLeft: 20 }}>
            <li>Power the unit on — the light should pulse <b>red</b> (setup mode).</li>
            <li>Join its WiFi network{s?.sensor?.apName ? <> — <b>{s.sensor.apName}</b></> : " (Soundwatch-…)"} and enter this site&apos;s WiFi.</li>
            <li><b>Do not change the token field</b> if the setup page shows one.</li>
            <li>Come back here — it can take a couple of minutes.</li>
          </ol>
        )}
        {st === "stale" && (
          <p style={{ fontSize: 14, color: "#444", marginTop: 10 }}>
            It reported earlier and has now stopped. Check it still has power, then wait a minute.
          </p>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Where is it installed?</h2>
      {s?.hasLocation ? (
        <p style={{ fontSize: 14, color: "#444" }}>
          Recorded{ s.sensor?.address ? `: ${s.sensor.address}` : "" }
          {s.sensor?.latitude != null && <> ({s.sensor.latitude.toFixed(5)}, {s.sensor!.longitude!.toFixed(5)})</>}
        </p>
      ) : (
        <p style={{ fontSize: 14, color: "#444" }}>Stand next to the unit and tap below.</p>
      )}
      <button onClick={() => saveLocation(s?.hasLocation === true)} disabled={busy}
        style={{ font: "inherit", fontSize: 16, padding: "12px 18px", borderRadius: 10,
                 border: "1px solid #ccc", background: "#fff", width: "100%" }}>
        {busy ? "Saving…" : s?.hasLocation ? "Update location to here" : "Use my current location"}
      </button>
      {msg && <p style={{ fontSize: 14, marginTop: 10 }}>{msg}</p>}

      <p style={{ fontSize: 13, color: "#666", marginTop: 24 }}>
        Please do not leave until this page shows <b style={{ color: "#0ca30c" }}>Receiving data</b>.
      </p>
    </main>
  );
}

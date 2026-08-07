"use client";

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("install");
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
      if (r.ok) { setMsg(t("locationSaved")); load(); }
      else if (r.status === 409) setMsg(t("alreadyLocated"));
      else setMsg(j.error ?? t("saveFailed"));
    } catch {
      setMsg(t("gpsFailed"));
    } finally { setBusy(false); }
  }

  const st = s?.state;
  const tone = st === "live" ? "#0ca30c" : st === "stale" ? "#fab219" : "#d03b3b";
  const headline =
    st === "live" ? t("live") :
    st === "stale" ? t("stale") :
    st === "never_seen" ? t("neverSeen") :
    st === "unknown_token" ? t("unknownToken") : t("checking");
  const bold = { b: (chunks: React.ReactNode) => <b>{chunks}</b> };

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 20,
                   font: "16px/1.5 system-ui, -apple-system, sans-serif" }}>
      <p style={{ color: "#666", margin: 0 }}>{t("title")}</p>
      <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>{t("device", { token })}</h1>
      {s?.sensor?.hardwareId && (
        <p style={{ color: "#666", margin: 0, fontSize: 13 }}>
          {t("hardwareLine", { id: s.sensor.hardwareId.slice(0, 8) + "…" })}
          {s.sensor.apName ? t("setupNetwork", { ap: s.sensor.apName }) : ""}
        </p>
      )}

      <div style={{ border: `2px solid ${tone}`, borderRadius: 12, padding: 16, margin: "18px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 650, color: tone }}>{headline}</div>
        {s?.lastReading && (
          <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>
            {t("lastReading", { s: s.lastReading.secondsAgo })}
            {s.lastReading.laeq != null && <> · {s.lastReading.laeq.toFixed(1)} dB</>}
            {s.lastReading.battery != null && t("battery", { n: s.lastReading.battery })}
            {s.lastReading.rssi != null && t("wifi", { n: s.lastReading.rssi })}
          </div>
        )}
        {st === "never_seen" && (
          <ol style={{ fontSize: 14, color: "#444", marginTop: 10, paddingLeft: 20 }}>
            <li>{t.rich("step1", bold)}</li>
            <li>{t.rich("step2", { ...bold, ap: s?.sensor?.apName ?? "none" })}</li>
            <li>{t.rich("step3", bold)}</li>
            <li>{t("step4")}</li>
          </ol>
        )}
        {st === "stale" && (
          <p style={{ fontSize: 14, color: "#444", marginTop: 10 }}>{t("staleHint")}</p>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>{t("whereInstalled")}</h2>
      {s?.hasLocation ? (
        <>
          <p style={{ fontSize: 14, color: "#444" }}>
            {t("recorded")}{ s.sensor?.address ? `: ${s.sensor.address}` : "" }
            {s.sensor?.latitude != null && <> ({s.sensor.latitude.toFixed(5)}, {s.sensor!.longitude!.toFixed(5)})</>}
            {s.sensor?.name ? <> — <b>{s.sensor.name}</b></> : null}
          </p>
          <button onClick={() => saveLocation(true)} disabled={busy}
            style={{ font: "inherit", fontSize: 17, fontWeight: 700, padding: "14px 18px",
                     minHeight: 52, borderRadius: 12, border: "none", width: "100%",
                     background: "#b45309", color: "#fff", cursor: "pointer",
                     ...(busy ? { opacity: 0.6, cursor: "wait" } : {}) }}>
            {busy ? t("saving") : t("updateHere")}
          </button>
          {msg && <p style={{ fontSize: 14, marginTop: 10 }}>{msg}</p>}
        </>
      ) : s ? (
        // Mounted only once the status is known: pinOnly must be right at
        // mount, because it seeds the picker's initial mode.
        <>
          {!s.sensor?.isExperimental && (
            <p style={{ fontSize: 14, color: "#444" }}>{t("pickSite")}</p>
          )}
          <SitePicker token={token} onSaved={load} pinOnly={s.sensor?.isExperimental === true} />
        </>
      ) : (
        <p style={{ fontSize: 14, color: "#666" }}>{t("checking")}</p>
      )}

      <p style={{ fontSize: 13, color: "#666", marginTop: 24 }}>
        {t.rich("doNotLeave", bold)}
      </p>
    </main>
  );
}

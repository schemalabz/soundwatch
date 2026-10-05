"use client";

// One unit: why it is in the state it is in, what happened to it, and its
// settings. Design canvas: Unit.dc.html.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminShell";
import LinkSiteDialog from "@/components/admin/LinkSiteDialog";
import UnitNotes from "@/components/admin/UnitNotes";
import UnitSettings from "@/components/admin/UnitSettings";
import { STATUS_META, StatusDot, ago, athens, boxCode } from "@/components/admin/fleetUi";
import type { SitesResponse, UnitDetailResponse, UnitEvent, UnitHour } from "@/lib/api/admin";
import { duringInstall } from "@/lib/fleet/status";
import { sensorPagePath } from "@/lib/sensor/api";

const RESET_CAUSE: Record<number, string> = { 1: "power-on", 16: "external reset", 32: "watchdog", 64: "software/power cycle" };

export default function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api } = useAdmin();
  const [data, setData] = useState<UnitDetailResponse | null>(null);
  const [sites, setSites] = useState<SitesResponse | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  // The settings panel remounts only when the unit itself changed through
  // settings or site linking — not on every load() (a note, a background
  // refresh) — so in-progress edits and the "Saved." message survive those.
  const [settingsRev, setSettingsRev] = useState(0);
  const [settingsNotice, setSettingsNotice] = useState<string | undefined>(undefined);

  const load = useCallback(() => {
    api<UnitDetailResponse>(`/api/admin/units/${id}`).then((d) => { setData(d); setError(""); }, () => setError("Could not load this unit."));
  }, [api, id]);
  useEffect(() => { load(); }, [load]);

  async function openLink() {
    setSites(await api<SitesResponse>("/api/admin/sites"));
    setLinking(true);
  }

  if (!data) return <p className="px-12 py-10 text-sm text-slate">{error || "Loading…"}</p>;

  const { unit, identity, diagnosis, lastReading } = data;
  const now = new Date(data.generatedAt).getTime();
  const meta = STATUS_META[unit.status];
  const title = unit.site?.name ?? unit.name ?? unit.address ?? (boxCode(unit.apName) ? `Box ${boxCode(unit.apName)}` : unit.deviceId);
  const lastAt = lastReading ? new Date(lastReading.receivedAt).getTime() : now;
  // The day that matters: the 24 h up to silence for a silent unit, else the last 24 h.
  const focusEnd = unit.status === "silent" ? Math.min(now, lastAt + 3 * 3600_000) : now;
  const installedMs = unit.installedAt ? new Date(unit.installedAt).getTime() : unit.status === "bench" ? new Date(identity.createdAt).getTime() : null;
  const installedAtDate = unit.installedAt ? new Date(unit.installedAt) : null;
  const routerRestarts = data.unit.network.routerRestarts7d;
  const network = unit.network;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-7 lg:px-12">
      <div className="flex flex-col gap-2.5">
        <nav aria-label="Breadcrumb" className="flex gap-2 text-[13px] text-slate">
          <Link href="/admin" className="underline">Fleet</Link><span aria-hidden>/</span><span>{meta.label}</span><span aria-hidden>/</span><span>{boxCode(unit.apName) ?? unit.deviceId.slice(0, 8)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-[30px] font-bold tracking-tight text-ink">{title}</h1>
          <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${unit.status === "silent" ? "bg-[#f8e7e5] text-loud" : unit.status === "watch" ? "bg-[#fbf4e6] text-[#96620f]" : "bg-[#f0f1f3] text-ink"}`}>
            <StatusDot status={unit.status} />
            {unit.status === "silent" ? `Silent for ${ago(unit.lastReceivedAt, now).replace(" ago", "")}` : meta.label}
          </span>
          <span className="flex-1" />
          <Link href={sensorPagePath(unit.id)} className="flex h-11 items-center rounded-[10px] border border-silver bg-white px-[18px] text-sm font-semibold text-ink">Live page</Link>
          <button onClick={openLink} className="h-11 rounded-[10px] bg-ink px-[18px] text-sm font-semibold text-white">{unit.site ? "Change site" : "Link to a site"}</button>
        </div>
        <p className="text-sm text-slate">
          Box <span className="font-mono text-ink">{unit.apName ?? "—"}</span>
          {unit.installedAt ? ` · installed ${athens(unit.installedAt)}` : unit.handedOverAt ? ` · with the installer since ${athens(unit.handedOverAt)}` : unit.provisionedAt ? ` · provisioned ${athens(unit.provisionedAt)}, not installed` : ""}
          {unit.site ? <> · site <Link href="/admin/sites" className="text-ink underline">{unit.site.name}</Link></> : unit.installedAt ? " · not linked to a site" : ""}
          {unit.retiredAt ? ` · retired ${athens(unit.retiredAt)}${unit.supersededBy ? `, now ${unit.supersededBy.deviceId}` : ""}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {diagnosis ? (
            <section className="flex flex-col gap-[18px] rounded-[14px] border border-border bg-white px-7 py-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.5px] text-slate">Likely cause</span>
                <h2 className="text-[22px] font-bold text-ink">{diagnosis.headline}</h2>
                {unit.silentCause === "network_lost_powered" && (
                  <p className="max-w-[760px] text-[15px] text-slate">If it stays powered it keeps measuring and will upload the missed readings when the internet returns.</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {diagnosis.evidence.map((e) => (
                  <div key={e.claim} className="flex gap-3 rounded-[10px] bg-[#f6f7f8] px-4 py-3.5">
                    {e.supports ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sw-ok)" strokeWidth="2.4" className="mt-0.5 shrink-0" aria-label="supports"><path d="m5 12 5 5 9-10" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sw-slate)" strokeWidth="2.4" className="mt-0.5 shrink-0" aria-label="does not support"><circle cx="12" cy="12" r="8" /></svg>
                    )}
                    <div className="flex flex-col gap-0.5"><span className="text-sm font-semibold text-ink">{e.claim}</span><span className="text-[13px] text-slate">{e.detail}</span></div>
                  </div>
                ))}
              </div>
            </section>
          ) : unit.status === "watch" ? (
            <section className="rounded-[14px] border border-[#ecd9b0] bg-[#fbf4e6] px-7 py-5">
              <h2 className="text-lg font-bold text-ink">On the watch list</h2>
              <p className="mt-1 text-sm text-slate">Live, but in the last 24 hours: {unit.watchReasons.join("; ")}.</p>
            </section>
          ) : null}

          <UnitNotes unitId={unit.id} notes={data.notes} siteNote={data.siteNote} onChanged={load} />

          <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-white px-7 pb-6 pt-5">
            <div className="flex flex-wrap items-baseline gap-4">
              <h2 className="text-lg font-bold text-ink">Last 7 days</h2>
              <span className="text-[13px] text-slate">
                Hourly. {data.brokerRecordsFrom
                  ? `Connection records exist from the broker log only (${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", day: "numeric", month: "short" }).format(new Date(data.brokerRecordsFrom))} onward).`
                  : "No connection records yet."}
              </span>
            </div>
            <Lanes hours={data.hours} events={data.events} start={now - 7 * 86400_000} end={now} tick="day" since={installedMs} installedAt={installedAtDate} />
            <div className="flex flex-col gap-3 border-t border-dashed border-[#dcdde0] pt-4">
              <h3 className="text-[13px] font-semibold text-ink">
                {unit.status === "silent" ? "The day it went silent" : "Last 24 hours"} · {athens(new Date(focusEnd - 24 * 3600_000).toISOString())} → {athens(new Date(focusEnd).toISOString())}
              </h3>
              <Lanes hours={data.hours} events={data.events} start={focusEnd - 24 * 3600_000} end={focusEnd} tick="hour" since={installedMs} installedAt={installedAtDate} labelIps />
            </div>
            <LaneLegend />
          </section>

          <section className="overflow-hidden rounded-[14px] border border-border bg-white">
            <div className="flex flex-wrap items-baseline gap-4 border-b border-border px-7 py-4">
              <h2 className="text-lg font-bold text-ink">Event log</h2>
              <span className="text-[13px] text-slate">Restarts and broker connections, newest first · last 14 days</span>
            </div>
            {data.events.length === 0 && <p className="px-7 py-4 text-sm text-slate">No events recorded.</p>}
            <ul>
              {data.events.slice(0, 60).map((e, i) => <EventRow key={`${e.at}-${e.kind}-${i}`} e={e} ipInfo={data.ipInfo} installedAt={installedAtDate} />)}
            </ul>
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[380px]">
          <section className="grid grid-cols-2 gap-[18px] rounded-[14px] border border-border bg-white px-[22px] py-5">
            <Metric label="Data, 7 days" value={unit.completeness7d == null ? "—" : `${Math.round(unit.completeness7d * 100)}%`} />
            <Metric
              label="Wifi signal"
              value={unit.rssiAvg24h != null ? `${unit.rssiAvg24h} dBm` : lastReading?.rssi != null ? `${lastReading.rssi} dBm` : "—"}
              sub={`${unit.rssiAvg24h != null ? "24 h average" : "at the last reading"}${unit.rssiMin7d != null ? ` · worst ${Math.round(unit.rssiMin7d)}` : ""}`}
            />
            <Metric label="Unscheduled restarts" value={String(unit.unscheduledBoots7d)} sub="last 7 days" />
            <Metric label="Battery" value={lastReading?.battery != null ? `${Math.round(lastReading.battery)}%` : "—"} sub="at the last reading" />
            <Metric label="Level, 7 days" value={unit.laeq7d != null ? `${unit.laeq7d.toFixed(1)} dB` : "—"} sub="LAeq, energy average" />
            <Metric label="Last data" value={ago(unit.lastReceivedAt, now)} sub={athens(unit.lastReceivedAt)} />
          </section>

          <section className="flex flex-col gap-3 rounded-[14px] border border-border bg-white px-[22px] py-5">
            <h3 className="text-[15px] font-bold text-ink">Store network</h3>
            <Row k="Provider" v={network.provider ?? "Unknown"} />
            <Row k="IP type" v={network.staticIp ? "Static" : network.staticIp === false ? "Dynamic" : "Unknown"} />
            <Row k="Latest public IP" v={network.ip ?? "—"} mono />
            <Row k="Public IPs, 7 days" v={String(network.ips7d)} warn={network.ips7d > 1} />
            <Row k="Router restarts, 7 days" v={String(routerRestarts)} warn={routerRestarts >= 2} />
          </section>

          <section className="flex flex-col gap-3 rounded-[14px] border border-border bg-white px-[22px] py-5">
            <h3 className="text-[15px] font-bold text-ink">Identity</h3>
            <Row k="Box (setup wifi)" v={unit.apName ?? "—"} mono />
            <Row k="Token" v={unit.deviceId} mono />
            <Row k="Chip" v={identity.hardwareId ? `${identity.hardwareId.slice(0, 8)}…${identity.hardwareId.slice(-8)}` : "—"} mono />
            <Row k="Firmware" v={[unit.firmware && `release ${unit.firmware}`, identity.firmwareVersion].filter(Boolean).join(" · ") || "—"} />
            {identity.samGitHash && <Row k="Build" v={`SAM ${identity.samGitHash.slice(0, 7)} · ESP ${identity.espGitHash?.slice(0, 7) ?? "—"}`} mono />}
            <Row k="Provisioned" v={athens(unit.provisionedAt)} />
            <Row k="Uptime" v={lastReading?.uptimeS != null ? `${(lastReading.uptimeS / 3600).toFixed(1)} h at last reading` : "—"} />
            {identity.previousTokens.length > 0 && (
              <Row k="Previously" v={identity.previousTokens.map((p) => p.deviceId).join(", ")} mono />
            )}
          </section>

          <UnitSettings
            key={settingsRev}
            data={data}
            notice={settingsNotice}
            onChanged={(msg) => { setSettingsNotice(msg); setSettingsRev((n) => n + 1); load(); }}
          />
        </aside>
      </div>

      {linking && sites && (
        <LinkSiteDialog
          unit={{ id: unit.id, apName: unit.apName, deviceId: unit.deviceId, latitude: unit.latitude, longitude: unit.longitude, name: unit.name, address: unit.address }}
          sites={sites.sites}
          onClose={() => setLinking(false)}
          onLinked={() => { setLinking(false); setSettingsNotice(undefined); setSettingsRev((n) => n + 1); load(); }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate">{label}</span>
      <span className="text-[22px] font-bold tabular-nums text-ink">{value}</span>
      {sub && <span className="text-xs text-slate">{sub}</span>}
    </div>
  );
}

function Row({ k, v, mono, warn }: { k: string; v: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-slate">{k}</span>
      <span className={`min-w-0 truncate text-right ${mono ? "font-mono text-[13px]" : ""} ${warn ? "font-semibold text-loud" : "text-ink"}`} title={v}>{v}</span>
    </div>
  );
}

function EventRow({ e, ipInfo, installedAt }: { e: UnitEvent; ipInfo: UnitDetailResponse["ipInfo"]; installedAt: Date | null }) {
  let dot = "bg-[#9aa3b5]", what = "", meta = "";
  const inInstall = duringInstall(new Date(e.at), installedAt);
  if (e.kind === "boot") {
    dot = e.scheduled ? "bg-[#8a8f9c]" : e.unscheduled ? "bg-loud" : inInstall ? "bg-[#8a8f9c]" : "bg-loud";
    what = e.scheduled ? "Scheduled daily restart" : e.unscheduled ? "Unscheduled restart" : inInstall ? "Restart during installation" : "Unscheduled restart";
    meta = `${e.resetCause != null ? RESET_CAUSE[e.resetCause] ?? `cause ${e.resetCause}` : ""}${e.uptimeBefore ? ` · after ${(e.uptimeBefore / 3600).toFixed(1)} h` : ""}`;
  } else if (e.kind === "connect") {
    dot = e.routerRestart ? "bg-warn" : "bg-[#9aa3b5]";
    const info = e.ip ? ipInfo[e.ip] : undefined;
    what = e.routerRestart
      ? "Reconnected from a new public IP — the store’s router restarted"
      : e.newIp && inInstall ? "Connected from a new public IP during installation"
      : e.newIp ? "Connected from a new public IP"
      : "Connected";
    meta = `${e.ip ?? ""}${info?.provider ? ` · ${info.provider}` : ""}`;
  } else {
    const timeout = /timeout/i.test(e.reason ?? "");
    dot = timeout ? "bg-loud" : "bg-[#c9cbd0]";
    what = timeout ? "Connection timed out — the unit or its network went away" : e.reason === "session taken over" ? "Old session replaced by a new connection" : `Disconnected (${e.reason})`;
    meta = e.ip ?? "";
  }
  return (
    <li className="grid grid-cols-[140px_16px_minmax(0,1fr)] items-center gap-3 border-b border-[#f0f1f3] px-7 py-2.5 text-sm md:grid-cols-[140px_16px_minmax(0,1fr)_220px]">
      <span className="font-mono text-[13px] text-slate">{athens(e.at)}</span>
      <span className={`size-2.5 rounded-full ${dot}`} />
      <span className="text-ink">{what}</span>
      <span className="hidden truncate text-right font-mono text-xs text-slate md:block">{meta}</span>
    </li>
  );
}

const LANE_W = 100; // percent

function Lanes({ hours, events, start, end, tick, since, installedAt, labelIps = false }: {
  hours: UnitHour[]; events: UnitEvent[]; start: number; end: number; tick: "day" | "hour";
  /** Install time: empty hours after it are outages, before it nothing was expected. */
  since: number | null;
  /** The unit's actual installed_at (null for bench/never-installed): is a boot within the install window? */
  installedAt: Date | null;
  labelIps?: boolean;
}) {
  const span = end - start;
  const pos = useCallback((t: number) => Math.max(0, Math.min(LANE_W, ((t - start) / span) * LANE_W)), [start, span]);

  const inWin = hours.filter((h) => { const t = new Date(h.t).getTime(); return t + 3600_000 > start && t < end; });
  const ticks = useMemo(() => {
    // Walk the window hour by hour and keep Athens midnights (day ticks) or
    // every third Athens hour — real local time, so DST shifts nothing.
    const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", hourCycle: "h23" });
    const fmt = new Intl.DateTimeFormat("en-GB", tick === "day"
      ? { timeZone: "Europe/Athens", month: "short", day: "numeric" }
      : { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" });
    const out: { t: number; label: string }[] = [];
    for (let t = Math.ceil(start / 3600_000) * 3600_000; t <= end; t += 3600_000) {
      const h = Number(hourOf.format(new Date(t)));
      if (tick === "day" ? h === 0 : h % 3 === 0) out.push({ t, label: fmt.format(new Date(t)) });
    }
    return out;
  }, [start, end, tick]);

  // Connection sessions: connect → the next disconnect or connect.
  const asc = [...events].reverse().filter((e) => new Date(e.at).getTime() <= end);
  const sessions: { from: number; to: number; ip: string; alt: boolean }[] = [];
  let open: { from: number; ip: string } | null = null;
  let alt = false;
  for (const e of asc) {
    const t = new Date(e.at).getTime();
    if (e.kind === "connect") {
      if (open) sessions.push({ ...open, to: t, alt });
      if (e.newIp) alt = !alt;
      open = { from: t, ip: e.ip ?? "" };
    } else if (e.kind === "disconnect" && open && e.reason !== "session taken over") {
      sessions.push({ ...open, to: t, alt });
      open = null;
    }
  }
  if (open) sessions.push({ ...open, to: end, alt });
  const vis = sessions.filter((s) => s.to > start && s.from < end);
  const boots = asc.filter((e) => e.kind === "boot" && new Date(e.at).getTime() >= start);

  const cellColor = (h: UnitHour) => (h.onTime > 0 ? "bg-ok" : h.n > 0 ? "bg-warn" : "bg-loud");
  // The rollup has no row for an hour with no readings — an outage after
  // install must still be drawn, not left as blank lane.
  const have = new Set(inWin.map((h) => Math.floor(new Date(h.t).getTime() / 3600_000)));
  const gaps: number[] = [];
  if (since != null) {
    for (let hr = Math.floor(Math.max(start, since) / 3600_000); hr * 3600_000 < end; hr++) {
      if (!have.has(hr)) gaps.push(hr * 3600_000);
    }
  }

  return (
    <div className="flex flex-col gap-2.5" role="img" aria-label={`Data, connection, restarts and battery between ${athens(new Date(start).toISOString())} and ${athens(new Date(end).toISOString())}`}>
      <div className="relative ml-[72px] h-4 sm:ml-[120px]">
        {ticks.map((t, i) => (
          // On a phone every second (days) or third (hours) tick: they collide otherwise.
          <span key={t.t} className={`absolute -translate-x-1/2 whitespace-nowrap text-xs text-slate ${i % (tick === "day" ? 2 : 3) ? "hidden sm:block" : ""}`} style={{ left: `${pos(t.t)}%` }}>{t.label}</span>
        ))}
      </div>
      <Lane label="Data">
        {gaps.map((t) => (
          <span key={`gap-${t}`} title="nothing measured" className="absolute top-1 h-[18px] bg-loud" style={{ left: `${pos(t)}%`, width: `${Math.max(0.15, pos(t + 3600_000) - pos(t))}%` }} />
        ))}
        {inWin.map((h) => {
          const t = new Date(h.t).getTime();
          return <span key={h.t} title={`${h.n} readings, ${h.onTime} on time`} className={`absolute top-1 h-[18px] ${cellColor(h)}`} style={{ left: `${pos(t)}%`, width: `${Math.max(0.15, pos(t + 3600_000) - pos(t))}%` }} />;
        })}
      </Lane>
      <Lane label="Connection">
        {vis.map((s, i) => (
          <span key={i} title={s.ip} className={`absolute top-1 flex h-[18px] items-center overflow-hidden rounded-[3px] pl-1.5 font-mono text-[11px] text-ink ${s.alt ? "bg-[#c4cad6]" : "bg-[#9aa3b5]"}`} style={{ left: `${pos(s.from)}%`, width: `${Math.max(0.3, pos(s.to) - pos(s.from))}%` }}>
            {labelIps && pos(s.to) - pos(s.from) > 12 ? s.ip : ""}
          </span>
        ))}
      </Lane>
      <Lane label="Restarts">
        {boots.map((b, i) => {
          const inInstall = duringInstall(new Date(b.at), installedAt);
          const red = b.unscheduled || (!b.scheduled && !inInstall);
          const title = b.scheduled ? "scheduled restart" : b.unscheduled ? "unscheduled restart" : inInstall ? "restart during installation" : "unscheduled restart";
          return <span key={i} title={title} className={`absolute top-0.5 h-[22px] w-[3px] ${red ? "bg-loud" : "bg-[#8a8f9c]"}`} style={{ left: `${pos(new Date(b.at).getTime())}%` }} />;
        })}
      </Lane>
      <Lane label="Battery">
        {inWin.filter((h) => h.batteryMin != null).map((h) => {
          const t = new Date(h.t).getTime();
          const b = h.batteryMin ?? 0;
          return <span key={h.t} title={`${Math.round(b)}%`} className="absolute bottom-1 bg-ok/60" style={{ left: `${pos(t)}%`, width: `${Math.max(0.15, pos(t + 3600_000) - pos(t))}%`, height: `${Math.max(2, (b / 100) * 18)}px` }} />;
        })}
      </Lane>
    </div>
  );
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center">
      <span className="w-[72px] shrink-0 text-[13px] font-medium text-slate sm:w-[120px]">{label}</span>
      <div className="relative h-[26px] flex-1 overflow-hidden rounded-md bg-[#f6f7f8]">{children}</div>
    </div>
  );
}

function LaneLegend() {
  const items: [string, string][] = [
    ["bg-ok", "Data on time"], ["bg-warn", "Measured offline, uploaded later"], ["bg-loud", "Nothing measured"],
    ["bg-[#9aa3b5]", "Connected (shade changes with each new public IP)"],
  ];
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-xs text-slate sm:ml-[120px]">
      {items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${c}`} />{l}</span>)}
      <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] bg-[#8a8f9c]" />Scheduled restart</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] bg-loud" />Unscheduled restart</span>
    </div>
  );
}

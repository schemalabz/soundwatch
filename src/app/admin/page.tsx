"use client";

// Fleet: what is wrong, why, and everything else at a glance. Layout follows
// the design canvas (Main.dc.html): headline sentence, four numbers, "needs
// attention" with a diagnosis per unit, a where-they-are map, then the unit
// table behind status tabs.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminShell";
import { STATUS_META, Strip, StripLegend, StatusDot, ago, athens, boxCode } from "@/components/admin/fleetUi";
import type { FleetResponse, FleetUnit } from "@/lib/api/admin";
import { SILENT_CAUSE_TEXT, type FleetStatus } from "@/lib/fleet/status";

/** The pilot's target: 50 units at Skroutz stores. */
const TARGET_SITES = 50;

type TabId = "deployed" | "live" | "watch" | "silent" | "boxed" | "bench" | "retired";
const TABS: { id: TabId; label: string; dot: string; match: (s: FleetStatus) => boolean }[] = [
  { id: "deployed", label: "Deployed", dot: "bg-ink", match: (s) => s === "live" || s === "watch" || s === "silent" },
  { id: "live", label: "Live", dot: "bg-ok", match: (s) => s === "live" },
  { id: "watch", label: "Watch", dot: "bg-warn", match: (s) => s === "watch" },
  { id: "silent", label: "Silent", dot: "bg-loud", match: (s) => s === "silent" },
  { id: "boxed", label: "In box", dot: "bg-slate", match: (s) => s === "in_box" || s === "with_installer" || s === "minted" },
  { id: "bench", label: "Bench", dot: "bg-[#9aa3b5]", match: (s) => s === "bench" },
  { id: "retired", label: "Retired", dot: "bg-[#dcdde0]", match: (s) => s === "retired" },
];

const ORDER: Record<FleetStatus, number> = { silent: 0, watch: 1, live: 2, with_installer: 3, in_box: 4, minted: 5, bench: 6, retired: 7 };

function unitTitle(u: FleetUnit): string {
  const named = u.site?.name ?? u.name ?? u.address;
  if (named) return named;
  const box = boxCode(u.apName);
  return box ? `Box ${box}` : u.deviceId;
}

/** The line under the title: where it is, or why we cannot say. */
function unitSubtitle(u: FleetUnit): string {
  if (u.site || u.name || u.address) return `${boxCode(u.apName) ?? "—"} · ${u.deviceId.slice(0, 8)}`;
  if (u.latitude != null) return `not linked to a site · ${u.deviceId.slice(0, 8)}`;
  return u.deviceId.slice(0, 8);
}

export default function FleetPage() {
  const { api } = useAdmin();
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("deployed");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    api<FleetResponse>("/api/admin/fleet").then((f) => { setFleet(f); setError(""); }, () => setError("Could not load the fleet."));
  }, [api]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const units = useMemo(() => fleet?.units ?? [], [fleet]);
  // The server's "now" (honours ADMIN_NOW in dev), so relative times agree with statuses.
  const now = fleet ? new Date(fleet.generatedAt).getTime() : 0;

  const deployed = units.filter((u) => u.status === "live" || u.status === "watch" || u.status === "silent");
  const live = deployed.filter((u) => u.status !== "silent");
  const silent = deployed.filter((u) => u.status === "silent");
  const watch = deployed.filter((u) => u.status === "watch");
  const comp = deployed.filter((u) => u.completeness7d != null);
  const avgComp = comp.length ? comp.reduce((a, u) => a + (u.completeness7d ?? 0), 0) / comp.length : null;
  const routerRestarts = deployed.reduce((a, u) => a + u.network.routerRestarts7d, 0);
  const restartStores = deployed.filter((u) => u.network.routerRestarts7d > 0).length;
  const boxed = units.filter((u) => u.status === "in_box" || u.status === "with_installer");

  const attention = [...silent, ...watch].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.lastReceivedAt ?? "").localeCompare(b.lastReceivedAt ?? ""));

  const active = TABS.find((t) => t.id === tab)!;
  const needle = q.trim().toLowerCase();
  const rows = units
    .filter((u) => active.match(u.status))
    .filter((u) => !needle || [unitTitle(u), u.apName, u.deviceId, u.address].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || unitTitle(a).localeCompare(unitTitle(b), "el"));

  const headline = fleet
    ? silent.length === 0
      ? `All ${deployed.length} installed units are sending data.`
      : `${live.length} of ${deployed.length} installed units are sending data. ${silent.length} ${silent.length === 1 ? "is" : "are"} silent` +
        (silent.every((u) => u.silentCause === "network_lost_powered") ? " with the sensor still powered — the store’s internet dropped." : ".")
    : "";

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:gap-7 sm:px-6 sm:py-9 lg:px-12">
      <section className="flex flex-wrap items-end gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-[32px] font-bold tracking-tight text-ink">Fleet</h1>
          <p className="max-w-[780px] text-base text-slate">{error || headline || "Loading…"}</p>
        </div>
        <div className="flex gap-2.5">
          <Link href="/admin/call-sheet" className="flex h-11 items-center rounded-[10px] border border-silver bg-white px-[18px] text-sm font-semibold text-ink">Call sheet</Link>
          <Link href="/admin/sites" className="flex h-11 items-center rounded-[10px] bg-ink px-[18px] text-sm font-semibold text-white">Sites</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tile label="Installed units sending data" value={fleet ? `${live.length}` : "—"} unit={`of ${deployed.length}`}>
          <div className="flex h-2 gap-[3px]">
            <div className="rounded-[3px] bg-ok" style={{ flexGrow: live.length }} />
            <div className="rounded-[3px] bg-loud" style={{ flexGrow: silent.length }} />
          </div>
        </Tile>
        <Tile label="Data completeness, 7 days" value={avgComp == null ? "—" : `${Math.round(avgComp * 100)}%`} unit="installed units">
          <span className="text-[13px] text-slate">Share of hours with any reading</span>
        </Tile>
        <Tile label="Store router restarts, 7 days" value={`${routerRestarts}`} unit={`at ${restartStores} ${restartStores === 1 ? "store" : "stores"}`}>
          <span className="text-[13px] text-slate">A unit reconnecting from a new public IP</span>
        </Tile>
        <Tile label="Deployment" value={`${deployed.length}`} unit={`of ${TARGET_SITES} installed`}>
          <div className="flex h-2 overflow-hidden rounded-[3px] bg-[#eceded]">
            <div className="bg-ok" style={{ width: `${(deployed.length / TARGET_SITES) * 100}%` }} />
            <div className="bg-slate" style={{ width: `${(boxed.length / TARGET_SITES) * 100}%` }} />
          </div>
          <span className="text-[13px] text-slate">{boxed.length} more boxed, ready to ship</span>
        </Tile>
      </section>

      <section className="flex flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-[2] flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-bold text-ink">Needs attention</h2>
            <span className="text-[13px] text-slate">Diagnosis from battery, signal and broker records</span>
          </div>
          {fleet && attention.length === 0 && (
            <p className="rounded-xl border border-border bg-white px-5 py-4 text-sm text-slate">Nothing needs attention right now.</p>
          )}
          {attention.map((u) => <AttentionCard key={u.id} u={u} now={now} />)}
        </div>
        <aside className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">Where they are</h2>
          <MiniMap units={deployed} />
        </aside>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3">
          <div role="tablist" aria-label="Filter units by status" className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const count = units.filter((u) => t.match(u.status)).length;
              const sel = t.id === tab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={sel}
                  onClick={() => setTab(t.id)}
                  className={`flex h-[52px] items-center gap-2 border-b-[3px] px-3.5 text-sm text-ink ${sel ? "border-sound font-bold" : "border-transparent font-medium hover:bg-muted/60"}`}
                >
                  <span className={`size-2 rounded-full ${t.dot}`} />
                  {t.label}
                  <span className="rounded-full bg-[#f0f1f3] px-2 py-px text-xs text-slate">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search units"
            placeholder="Store, box code, token…"
            className="my-2 h-9 w-56 rounded-lg border border-border px-3 text-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead>
              <tr className="border-b border-border bg-[#fafafb] text-xs font-semibold uppercase tracking-[0.4px] text-slate">
                <th className="px-5 py-2.5">Unit</th>
                <th className="px-3 py-2.5">Last 30 days</th>
                <th className="px-3 py-2.5">Last data</th>
                <th className="px-3 py-2.5">Data, 7 d</th>
                <th className="px-3 py-2.5">Wifi signal</th>
                <th className="px-3 py-2.5">Store network</th>
                <th className="px-3 py-2.5">Battery</th>
                <th className="px-3 py-2.5">Level, 7 d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => <UnitRow key={u.id} u={u} now={now} />)}
              {fleet && rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-6 text-sm text-slate">No units here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-5 py-3">
          <StripLegend />
          <span className="flex-1" />
          <span className="text-xs text-slate">12-hour cells · level = LAeq, energy average over 7 days</span>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, unit, children }: { label: string; value: string; unit: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-white px-3.5 py-3.5 sm:gap-2.5 sm:px-5 sm:py-[18px]">
      <span className="text-[13px] text-slate">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-bold tabular-nums text-ink sm:text-[30px]">{value}</span>
        <span className="text-sm text-slate sm:text-base">{unit}</span>
      </div>
      {children}
    </div>
  );
}

function AttentionCard({ u, now }: { u: FleetUnit; now: number }) {
  const meta = STATUS_META[u.status];
  const why =
    u.status === "silent"
      ? SILENT_CAUSE_TEXT[u.silentCause ?? "unknown"]
      : `On the watch list: ${u.watchReasons.join(", ")}.`;
  const evidence = [
    u.batteryLast != null && `battery ${Math.round(u.batteryLast)}% at the last reading`,
    u.network.routerRestarts7d > 0 && `${u.network.routerRestarts7d} router ${u.network.routerRestarts7d === 1 ? "restart" : "restarts"} in 7 days`,
    u.unscheduledBoots7d > 0 && `${u.unscheduledBoots7d} unscheduled ${u.unscheduledBoots7d === 1 ? "restart" : "restarts"}`,
    u.network.provider && `${u.network.provider}${u.network.staticIp ? " · static IP" : u.network.staticIp === false ? " · dynamic IP" : ""}`,
    !u.network.ip && u.status === "silent" && "no connection records",
  ].filter(Boolean).join(" · ");
  return (
    <Link href={`/admin/units/${u.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl border border-border bg-white px-[18px] py-4 hover:border-silver">
      <StatusDot status={u.status} className="mt-1.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-[15px] font-semibold text-ink">{unitTitle(u)}</span>
          <span className="hidden font-mono text-xs text-slate sm:inline">{unitSubtitle(u)}</span>
        </div>
        <span className="text-sm text-ink">{why}</span>
        {evidence && <span className="text-[13px] text-slate">{evidence}</span>}
      </div>
      <div className="flex w-full shrink-0 items-baseline gap-2 pl-[26px] sm:w-auto sm:flex-col sm:items-end sm:gap-1 sm:pl-0">
        <span className={`text-[13px] font-semibold ${meta.text}`}>
          {u.status === "silent" ? `Silent ${ago(u.lastReceivedAt, now).replace(" ago", "")}` : meta.label}
        </span>
        <span className="text-xs text-slate">{u.status === "silent" ? `since ${athens(u.lastReceivedAt)}` : ""}</span>
      </div>
    </Link>
  );
}

function UnitRow({ u, now }: { u: FleetUnit; now: number }) {
  const silent = u.status === "silent";
  return (
    <tr className="border-b border-[#eef0f2] hover:bg-[#f3f4f6]">
      <td className="px-5 py-3">
        <Link href={`/admin/units/${u.id}`} className="flex items-center gap-2.5">
          <StatusDot status={u.status} />
          <span className="flex min-w-0 flex-col">
            <span className="max-w-[230px] truncate text-sm font-semibold text-ink">{unitTitle(u)}</span>
            <span className="font-mono text-xs text-slate">{unitSubtitle(u)}</span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3"><Strip cells={u.cells} label={unitTitle(u)} /></td>
      <td className="px-3 py-3">
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${silent ? "text-loud" : "text-ink"}`}>{ago(u.lastReceivedAt, now)}</span>
          <span className="text-xs text-slate">{u.status === "watch" ? u.watchReasons[0] : athens(u.lastReceivedAt)}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-sm tabular-nums">{u.completeness7d == null ? "—" : `${Math.round(u.completeness7d * 100)}%`}</td>
      <td className="px-3 py-3">
        <div className="flex flex-col">
          <span className="text-sm tabular-nums">{u.rssiAvg24h != null ? `${u.rssiAvg24h} dBm` : "—"}</span>
          <span className="text-xs text-slate">{u.rssiMin7d != null ? `worst ${Math.round(u.rssiMin7d)}` : ""}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col">
          <span className="text-sm">{u.network.provider ?? "—"}</span>
          <span className={`text-xs ${u.network.routerRestarts7d >= 2 ? "text-loud" : "text-slate"}`}>
            {u.network.ip
              ? `${u.network.staticIp ? "static" : u.network.staticIp === false ? "dynamic" : "?"} · ${u.network.ips7d} ${u.network.ips7d === 1 ? "IP" : "IPs"} in 7 d`
              : ""}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-sm tabular-nums">{u.batteryLast != null ? `${Math.round(u.batteryLast)}%` : "—"}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className={`h-4 w-1.5 rounded-sm ${u.laeq7d != null ? "bg-sound" : "bg-border"}`} />
          <span className="text-sm tabular-nums">{u.laeq7d != null ? `${u.laeq7d.toFixed(1)} dB` : "—"}</span>
        </div>
      </td>
    </tr>
  );
}

/** A schematic of where installed units are — no tiles, so it needs no map
 *  token and stays readable at a glance. The public map is the real map. */
function MiniMap({ units }: { units: FleetUnit[] }) {
  const pts = units.filter((u) => u.latitude != null && u.longitude != null);
  if (pts.length === 0) return <div className="h-[430px] rounded-xl border border-border bg-[#eef0f2]" />;
  const lats = pts.map((u) => u.latitude!), lngs = pts.map((u) => u.longitude!);
  const pad = 0.008;
  const [la0, la1, lo0, lo1] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad, Math.max(...lngs) + pad];
  return (
    <div className="relative h-[430px] overflow-hidden rounded-xl border border-border bg-[#eef0f2]">
      {pts.map((u) => {
        const x = ((u.longitude! - lo0) / (lo1 - lo0)) * 100;
        const y = ((la1 - u.latitude!) / (la1 - la0)) * 100;
        return (
          // Labels near the right edge flip to the left of their dot.
          <Link key={u.id} href={`/admin/units/${u.id}`} className={`absolute flex -translate-y-[7px] items-center gap-1.5 ${x > 65 ? "-translate-x-[calc(100%-7px)] flex-row-reverse" : "-translate-x-[7px]"}`} style={{ left: `${x}%`, top: `${y}%` }}>
            <span className={`size-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_#bfc0c0] ${STATUS_META[u.status].dot}`} />
            <span className="rounded bg-white/85 px-1.5 text-xs font-medium text-ink">{unitTitle(u).replace(/^Skroutz /, "")}</span>
          </Link>
        );
      })}
    </div>
  );
}

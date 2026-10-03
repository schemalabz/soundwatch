"use client";

// Alerts: every outage becomes an incident with its evidence, opened and
// closed by the evaluator in the ingester, and announced on Discord.
// Design canvas: Alerts.dc.html.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminShell";
import { ago, athens, boxCode } from "@/components/admin/fleetUi";
import type { AdminIncident, IncidentsResponse } from "@/lib/api/admin";
import { SILENT_CAUSE_TEXT } from "@/lib/fleet/status";

const KIND: Record<AdminIncident["kind"], { label: string; dot: string }> = {
  silent: { label: "silent", dot: "bg-loud" },
  router_restarts: { label: "store router keeps restarting", dot: "bg-warn" },
  unscheduled_restarts: { label: "restarting on its own", dot: "bg-warn" },
  weak_signal: { label: "weak wifi signal", dot: "bg-warn" },
};

function span(fromIso: string, toMs: number): string {
  return ago(fromIso, toMs).replace(" ago", "").replace(/^now$/, "under a minute");
}

function why(i: AdminIncident): string {
  const ev = i.evidence ?? {};
  if (i.kind === "silent") return SILENT_CAUSE_TEXT[i.cause ?? "unknown"];
  if (typeof ev.count === "number") return `${ev.count} times in 24 hours`;
  if (typeof ev.rssiAvg1h === "number") return `${ev.rssiAvg1h} dBm over the last hour`;
  return "";
}

export default function AlertsPage() {
  const { api } = useAdmin();
  const [data, setData] = useState<IncidentsResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<IncidentsResponse>("/api/admin/incidents").then(setData, () => setError("Could not load incidents."));
  }, [api]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const now = data ? new Date(data.generatedAt).getTime() : 0;
  const latestDelivery = data ? [...data.open, ...data.resolved].find((i) => i.delivery)?.delivery ?? null : null;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8 lg:flex-row lg:px-12">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[30px] font-bold text-ink">Alerts</h1>
          <p className="max-w-[760px] text-[15px] text-slate">
            Every outage becomes an incident with its evidence, opened and closed automatically. Εξάρχεια went unnoticed
            for 20 days; with these rules it would have been flagged in {data?.rules.silentMinutes ?? 30} minutes.
          </p>
          {error && <p className="text-sm text-loud">{error}</p>}
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-baseline gap-2.5 border-b border-border px-[22px] py-4">
            <h2 className="text-[17px] font-bold text-ink">Open</h2>
            <span className="text-[13px] text-slate">{data ? `${data.open.length} ${data.open.length === 1 ? "incident" : "incidents"}` : ""}</span>
          </div>
          {data && data.open.length === 0 && <p className="px-[22px] py-4 text-sm text-slate">Nothing open.</p>}
          {data?.open.map((i) => (
            <IncidentRow key={i.id} i={i} right={<><span className="text-sm font-medium text-ink">{span(i.openedAt, now)}</span><span className="text-xs text-slate">since {athens(i.openedAt)}</span></>} extra={
              <span className={`text-[13px] ${i.delivery === "discord" ? "text-ok" : "text-slate"}`}>
                {i.delivery === "discord" ? "Sent to Discord" : i.delivery === "dry-run" ? "Logged (dry run)" : "Not sent yet"}
              </span>
            } />
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-baseline gap-2.5 border-b border-border px-[22px] py-4">
            <h2 className="text-[17px] font-bold text-ink">Recently resolved</h2>
            <span className="text-[13px] text-slate">Last 14 days</span>
          </div>
          {data && data.resolved.length === 0 && <p className="px-[22px] py-4 text-sm text-slate">None.</p>}
          {data?.resolved.slice(0, 30).map((i) => (
            <IncidentRow key={i.id} i={i} muted right={
              <><span className="text-sm text-ink">lasted {span(i.openedAt, new Date(i.closedAt!).getTime())}</span><span className="font-mono text-xs text-slate">{athens(i.closedAt)}</span></>
            } />
          ))}
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[440px]">
        <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-white px-[22px] py-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-bold text-ink">Delivery</h2>
            <span className="text-[13px] text-slate">
              {latestDelivery === "discord"
                ? "Discord webhook is configured and delivering."
                : latestDelivery === "dry-run"
                  ? "Dry run: no Discord webhook set yet, so alerts are written to the ingester log."
                  : "No alert has been delivered yet."}
            </span>
          </div>
          <p className="rounded-[10px] bg-[#f6f7f8] px-3.5 py-3 text-[13px] text-slate">
            Set <code className="font-mono text-ink">DISCORD_WEBHOOK_URL</code> on the ingester to send to Discord. Incidents already
            logged in the dry run are not re-sent.
          </p>
        </section>

        <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-white px-[22px] py-5">
          <h2 className="text-[17px] font-bold text-ink">Rules</h2>
          {data && (
            <ul className="flex flex-col gap-3 text-sm">
              <Rule name={`Unit silent for ${data.rules.silentMinutes} minutes`} detail="Includes the likely cause: store network lost with the sensor powered, sensor on battery, or unknown." />
              <Rule name="Store router restarting" detail={`The unit reconnects from a new public IP ${data.rules.routerRestarts24h} or more times in 24 hours.`} />
              <Rule name="Unscheduled restarts" detail={`${data.rules.unscheduledBoots24h} or more outside the 06:00 window in 24 hours.`} />
              <Rule name="Weak wifi signal" detail={`Below ${data.rules.weakRssiDbm} dBm on average over the last hour.`} />
            </ul>
          )}
          <p className="text-xs text-slate">Each incident is announced once when it opens and once when it resolves.</p>
        </section>
      </aside>
    </div>
  );
}

function IncidentRow({ i, right, extra, muted = false }: { i: AdminIncident; right: React.ReactNode; extra?: React.ReactNode; muted?: boolean }) {
  return (
    <Link href={`/admin/units/${i.unit.id}`} className="grid grid-cols-[12px_minmax(0,1fr)_150px] items-center gap-4 border-b border-[#eef0f2] px-[22px] py-3.5 hover:bg-[#f3f4f6] md:grid-cols-[12px_minmax(0,1fr)_150px_140px]">
      <span className={`size-2.5 rounded-full ${muted ? "bg-silver" : KIND[i.kind].dot}`} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-ink">
          {i.unit.title} <span className="font-mono text-xs font-normal text-slate">{boxCode(i.unit.apName) ?? ""}</span> · {KIND[i.kind].label}
        </span>
        <span className="text-[13px] text-slate">{why(i)}</span>
      </span>
      <span className="flex flex-col">{right}</span>
      <span className="hidden md:block">{extra}</span>
    </Link>
  );
}

function Rule({ name, detail }: { name: string; detail: string }) {
  return (
    <li className="flex flex-col gap-0.5 border-t border-[#eef0f2] pt-3">
      <span className="font-semibold text-ink">{name}</span>
      <span className="text-[13px] text-slate">{detail}</span>
    </li>
  );
}

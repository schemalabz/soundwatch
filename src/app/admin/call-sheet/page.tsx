"use client";

// Call sheet: what to ask the installer, most urgent first — built from live
// data, phone-first, for calls like the one on Sep 30. Design canvas:
// Phone.dc.html. "Answered" ticks are kept in this browser only.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminShell";
import { ago, athens, boxCode } from "@/components/admin/fleetUi";
import type { FleetResponse, SitesResponse } from "@/lib/api/admin";
import { askFor } from "@/lib/fleet/diagnosis";

interface Item {
  id: string;
  urgent: boolean;
  store: string;
  box: string;
  state: string;
  ask: string[];
  href: string;
}

const STORAGE_KEY = "sw-call-sheet-answered";

function readAnswered(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function CallSheetPage() {
  const { api } = useAdmin();
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [sites, setSites] = useState<SitesResponse | null>(null);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<FleetResponse>("/api/admin/fleet").then(setFleet, () => {});
    api<SitesResponse>("/api/admin/sites").then(setSites, () => {});
  }, [api]);
  useEffect(() => {
    load();
    void Promise.resolve().then(() => setAnswered(readAnswered()));
  }, [load]);

  const now = fleet ? new Date(fleet.generatedAt).getTime() : 0;

  const items = useMemo<Item[]>(() => {
    if (!fleet || !sites) return [];
    const out: Item[] = [];
    const titleOf = (u: FleetResponse["units"][number]) =>
      u.site?.name ?? u.name ?? u.address ?? (boxCode(u.apName) ? `Box ${boxCode(u.apName)}` : u.deviceId.slice(0, 8));

    const silent = fleet.units
      .filter((u) => u.status === "silent")
      .sort((a, b) => (a.lastReceivedAt ?? "").localeCompare(b.lastReceivedAt ?? ""));
    for (const u of silent) {
      const cause = u.silentCause ?? "unknown";
      out.push({
        id: `silent:${u.id}:${u.lastReceivedAt}`,
        urgent: true,
        store: titleOf(u),
        box: boxCode(u.apName) ?? u.deviceId.slice(0, 8),
        state: `Silent ${ago(u.lastReceivedAt, now).replace(" ago", "")}${cause === "network_lost_powered" ? " · sensor had power" : cause === "on_battery" ? " · was on battery" : ""}`,
        ask: [
          `It stopped on ${athens(u.lastReceivedAt)}.`,
          ...askFor(cause, u.network.routerRestarts7d > 0),
          ...(u.site || u.address ? [] : ["What is the exact store address?"]),
        ],
        href: `/admin/units/${u.id}`,
      });
    }

    for (const u of sites.unlinked.filter((x) => x.status !== "silent")) {
      out.push({
        id: `unlinked:${u.id}`,
        urgent: false,
        store: u.name ?? "Unknown store",
        box: boxCode(u.apName) ?? u.deviceId.slice(0, 8),
        state: "Live, but not linked to a site",
        ask: [`Which store is box ${boxCode(u.apName) ?? u.deviceId.slice(0, 8)} at? What is the exact address?`],
        href: `/admin/units/${u.id}`,
      });
    }

    for (const s of sites.sites.filter((x) => x.isActive && x.stage === "waiting")) {
      out.push({
        id: `waiting:${s.id}`,
        urgent: false,
        store: s.name,
        box: "no unit",
        state: "Waiting for a unit",
        ask: ["Is a box installed here? Which one (Soundwatch-XXXX)?", "Is the internet connected yet?"],
        href: "/admin/sites",
      });
    }

    const withInstaller = fleet.units.filter((u) => u.status === "with_installer");
    if (withInstaller.length) {
      out.push({
        id: `handed:${withInstaller.map((u) => u.id).join(",")}`,
        urgent: false,
        store: "Boxes with the installer",
        box: withInstaller.map((u) => boxCode(u.apName) ?? u.deviceId.slice(0, 8)).join(", "),
        state: `${withInstaller.length} handed over, not installed yet`,
        ask: ["Which of these are installed, and where?"],
        href: "/admin/inventory",
      });
    }
    return out;
  }, [fleet, sites, now]);

  function toggle(id: string) {
    const next = { ...answered, [id]: !answered[id] };
    setAnswered(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* per-browser convenience only */ }
  }

  async function copyText() {
    const text = items
      .map((it, i) => `${i + 1}. ${it.store} (${it.box}) — ${it.state}\n${it.ask.map((a) => `   - ${a}`).join("\n")}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  const open = items.filter((it) => !answered[it.id]).length;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-2xl font-bold text-ink">Call sheet</h1>
          <span className="text-sm text-slate">{fleet && sites ? `For the installer · ${open} of ${items.length} to ask, most urgent first` : "Loading…"}</span>
        </div>
        <button onClick={copyText} disabled={!items.length} className="h-10 shrink-0 rounded-[10px] border border-silver bg-white px-3 text-sm font-semibold text-ink disabled:opacity-40">
          {copied ? "Copied" : "Copy as text"}
        </button>
      </div>
      {fleet && sites && items.length === 0 && <p className="rounded-xl border border-border bg-white px-4 py-4 text-sm text-slate">Nothing to ask right now.</p>}
      {items.map((it) => {
        const done = !!answered[it.id];
        return (
          <article key={it.id} className={`flex flex-col gap-2 rounded-[14px] border border-border bg-white px-4 py-3.5 ${done ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2">
              <span className={`size-[9px] rounded-full ${it.urgent ? "bg-loud" : "bg-[#8a8f9c]"}`} />
              <Link href={it.href} className="flex-1 text-base font-bold text-ink">{it.store}</Link>
              <span className="font-mono text-xs text-slate">{it.box}</span>
            </div>
            <span className={`text-[13px] font-semibold ${it.urgent ? "text-loud" : "text-slate"}`}>{it.state}</span>
            <ul className="flex flex-col gap-1 text-sm leading-snug text-ink">
              {it.ask.map((a) => <li key={a}>{a}</li>)}
            </ul>
            <button
              onClick={() => toggle(it.id)}
              aria-pressed={done}
              className={`flex h-10 w-fit items-center gap-2 rounded-[10px] border px-3.5 text-sm font-semibold ${done ? "border-[#9cc3aa] bg-[#eef5f0] text-[#3f7a55]" : "border-silver bg-white text-ink"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="m5 12 5 5 9-10" /></svg>
              {done ? "Answered" : "Mark answered"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

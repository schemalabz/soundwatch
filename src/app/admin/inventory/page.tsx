"use client";

// Inventory: one row per physical box (chip id), not per token. Follows the
// design canvas (Inventory.dc.html): where every box is, the boxes registered
// twice, what is ready to ship and whether it passed a bench check.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DeviceLabel from "@/components/admin/DeviceLabel";
import { useAdmin } from "@/components/admin/AdminShell";
import { STATUS_META, StatusDot, ago, athens, boxCode } from "@/components/admin/fleetUi";
import type { InventoryBox, InventoryResponse } from "@/lib/api/admin";

type Group = "store" | "ready" | "bench" | "retired";

function groupOf(b: InventoryBox): Group {
  const s = b.current.status;
  if (s === "live" || s === "watch" || s === "silent") return "store";
  if (s === "in_box" || s === "with_installer" || s === "minted") return "ready";
  if (s === "bench") return "bench";
  return "retired";
}

const GROUP_META: Record<Group, { label: string; color: string }> = {
  store: { label: "At a store", color: "bg-ok" },
  ready: { label: "Ready to ship", color: "bg-slate" },
  bench: { label: "Bench", color: "bg-[#9aa3b5]" },
  retired: { label: "Retired", color: "bg-[#dcdde0]" },
};

export default function InventoryPage() {
  const { api } = useAdmin();
  const [inv, setInv] = useState<InventoryResponse | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [label, setLabel] = useState<InventoryBox | null>(null);

  const load = useCallback(() => {
    api<InventoryResponse>("/api/admin/inventory").then(setInv, () => setNote("Could not load the inventory."));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const boxes = inv?.boxes.filter((b) => b.hardwareId || !b.current.retiredAt) ?? [];
  const physical = boxes.filter((b) => groupOf(b) !== "retired");
  const by = (g: Group) => physical.filter((b) => groupOf(b) === g);
  const store = by("store"), ready = by("ready"), bench = by("bench");
  const dupes = boxes.filter((b) => b.duplicates.length > 0);
  const retiredTokens = (inv?.boxes ?? []).flatMap((b) =>
    [b.current, ...b.previous].filter((t) => t.retiredAt).map((t) => ({ t, box: b })),
  );
  const target = inv?.target ?? 50;
  const now = inv ? new Date(inv.generatedAt).getTime() : 0;

  async function retireDuplicates() {
    const n = dupes.reduce((a, b) => a + b.duplicates.length, 0);
    if (!window.confirm(`Retire ${n} old ${n === 1 ? "token" : "tokens"}? Their readings stay; you can undo each one.`)) return;
    setBusy(true);
    try {
      for (const b of dupes)
        for (const d of b.duplicates)
          await api(`/api/admin/sensors/${d.id}/retire`, { method: "POST", body: JSON.stringify({ supersededById: b.current.id }) });
      setNote(`Retired ${n} old ${n === 1 ? "token" : "tokens"}.`);
    } catch {
      setNote("Retiring failed part-way; the list below shows what is left.");
    } finally {
      setBusy(false);
      load();
    }
  }

  async function handover(ids: string[], undo = false) {
    setBusy(true);
    try {
      for (const id of ids) await api(`/api/admin/sensors/${id}/handover`, { method: "POST", body: JSON.stringify({ undo }) });
      setSel(new Set());
      setNote(undo ? "Taken back from the installer." : `${ids.length} ${ids.length === 1 ? "box" : "boxes"} marked as with the installer.`);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function unretire(id: string) {
    await api(`/api/admin/sensors/${id}/retire`, { method: "POST", body: JSON.stringify({ undo: true }) });
    load();
  }

  const zeroBattery = ready.filter((b) => b.current.batteryLast === 0).length;
  const notChecked = ready.filter((b) => b.current.bench?.verdict !== "passed").length;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8 lg:px-12">
      <section className="flex flex-col gap-1.5">
        <h1 className="text-[30px] font-bold text-ink">Inventory</h1>
        <p className="max-w-[860px] text-[15px] text-slate">
          One row per physical box, identified by its chip, not by its token. Re-provisioning a box gives it a new
          token; the old one stays behind as history.
        </p>
        {note && <p role="status" className="text-sm font-medium text-ink">{note}</p>}
      </section>

      <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-white px-6 py-5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[26px] font-bold tabular-nums text-ink">{inv ? physical.length : "—"}</span>
          <span className="text-[15px] text-slate">physical boxes toward a target of {target}</span>
          <span className="flex-1" />
          {inv && <span className="text-[13px] text-slate">{Math.max(0, target - physical.length)} still to build</span>}
        </div>
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded bg-[#eceded]">
          {(["store", "ready", "bench"] as Group[]).map((g) => (
            <div key={g} className={GROUP_META[g].color} style={{ width: `${(by(g).length / target) * 100}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <GroupStat g="store" n={store.length} sub={`${store.filter((b) => b.current.status !== "silent").length} sending · ${store.filter((b) => b.current.status === "silent").length} silent`} />
          <GroupStat g="ready" n={ready.length} sub={`${ready.filter((b) => b.current.status === "with_installer").length} with the installer`} />
          <GroupStat g="bench" n={bench.length} sub={bench.map((b) => b.current.apName ? boxCode(b.current.apName) : b.current.deviceId).join(" · ")} />
        </div>
      </section>

      {dupes.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-[#ecd9b0] bg-[#fbf4e6] px-[22px] py-[18px]">
          <div className="flex flex-wrap items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#96620f" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden><path d="M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base font-bold text-ink">{dupes.length} {dupes.length === 1 ? "box is" : "boxes are"} registered twice</span>
              <span className="text-sm text-slate">The old token still counts as a unit of its own. Retiring it keeps its readings and links it to the box’s new token.</span>
            </div>
            <button onClick={retireDuplicates} disabled={busy} className="h-10 shrink-0 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
              Retire {dupes.reduce((a, b) => a + b.duplicates.length, 0)} old tokens
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {dupes.flatMap((b) => b.duplicates.map((d) => (
              <div key={d.id} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2.5 font-mono text-[13px]">
                <span className="font-medium">{boxCode(b.current.apName) ?? b.key.slice(0, 8)}</span>
                <span className="text-[#8a8f9c] line-through">{d.deviceId.slice(0, 10)}</span>
                <span aria-hidden className="text-slate">→</span>
                <span>{b.current.deviceId.slice(0, 10)}</span>
              </div>
            )))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center gap-3.5 border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Ready to ship</h2>
          <span className="text-[13px] text-slate">
            {ready.length} boxes · {notChecked} without a passed bench check{zeroBattery ? ` · ${zeroBattery} report 0% battery` : ""}
          </span>
          <span className="flex-1" />
          <span className="text-[13px] text-slate">{sel.size ? `${sel.size} selected` : "Select boxes to hand over"}</span>
          <button
            disabled={sel.size === 0 || busy}
            onClick={() => handover([...sel])}
            className="h-[38px] rounded-[9px] border border-silver bg-white px-3.5 text-sm font-semibold text-ink disabled:opacity-50"
          >
            Hand to installer
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b border-border bg-[#fafafb] text-xs font-semibold uppercase tracking-[0.4px] text-slate">
                <th className="w-10 px-5 py-2.5"><span className="sr-only">Select</span></th>
                <th className="px-3 py-2.5">Box</th>
                <th className="px-3 py-2.5">Chip</th>
                <th className="px-3 py-2.5">Firmware</th>
                <th className="px-3 py-2.5">Bench check</th>
                <th className="px-3 py-2.5">Signal</th>
                <th className="px-3 py-2.5">Battery</th>
                <th className="px-3 py-2.5">Where</th>
                <th className="px-3 py-2.5">Previously</th>
                <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {ready.map((b) => {
                const c = b.current;
                const checked = sel.has(c.id);
                const withInstaller = c.status === "with_installer";
                return (
                  <tr key={b.key} className={`border-b border-[#eef0f2] ${checked ? "bg-[#fdf3ee]" : ""}`}>
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.apName ?? c.deviceId}`}
                        checked={checked}
                        disabled={withInstaller}
                        onChange={() => setSel((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                        className="size-[18px]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/units/${c.id}`} className="flex flex-col">
                        <span className="font-mono text-sm font-medium text-ink">{c.apName ?? "no setup name"}</span>
                        <span className="font-mono text-xs text-slate">{c.deviceId.slice(0, 8)}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[13px] text-slate">{b.hardwareId ? `${b.hardwareId.slice(0, 8)}…` : "—"}</td>
                    <td className="px-3 py-2.5 text-sm">{c.firmware ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 text-sm">
                        <span className={`size-2 rounded-full ${c.bench?.verdict === "passed" ? "bg-ok" : c.bench?.verdict === "short" ? "bg-warn" : "bg-loud"}`} />
                        {c.bench?.text ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums">{c.rssiAvg != null ? `${c.rssiAvg} dBm` : "—"}</td>
                    <td className={`px-3 py-2.5 text-sm tabular-nums ${c.batteryLast === 0 ? "font-semibold text-loud" : ""}`}>
                      {c.batteryLast == null ? "—" : c.batteryLast === 0 ? "0% · check" : `${Math.round(c.batteryLast)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-sm">
                      {withInstaller ? (
                        <span className="flex flex-col">
                          <span>With installer</span>
                          <button onClick={() => handover([c.id], true)} className="w-fit text-xs text-slate underline">since {athens(c.handedOverAt)} · undo</button>
                        </span>
                      ) : (
                        <span className="text-slate">In box · seen {ago(c.lastReceivedAt, now)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate">{b.previous.map((p) => p.deviceId.slice(0, 8)).join(", ") || "new box"}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setLabel(b)}
                        disabled={!c.apName}
                        title={c.apName ? "Print label" : "Provision first — the label needs the setup name"}
                        className="h-8 rounded-lg border border-border px-2.5 text-[13px] font-medium text-ink disabled:opacity-40"
                      >
                        Label
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1 px-5 py-3 text-xs text-slate md:flex-row md:gap-5">
          <span>Proposed bench check: 30 minutes of readings, each with a wifi signal and a sound level.</span>
          <span className="flex-1" />
          <span>Battery 0% means flat or not connected — check before shipping: the battery is how we tell a power cut from a router outage.</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex items-baseline gap-3.5 border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-ink">At stores and on the bench</h2>
          <span className="text-[13px] text-slate">{store.length + bench.length} boxes</span>
        </div>
        <ul className="divide-y divide-[#eef0f2]">
          {[...store, ...bench].map((b) => (
            <li key={b.key}>
              <Link href={`/admin/units/${b.current.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-[#f3f4f6]">
                <StatusDot status={b.current.status} />
                <span className="w-40 font-mono text-sm font-medium text-ink">{b.current.apName ?? b.current.deviceId.slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{b.current.siteName ?? "Not linked to a site"}</span>
                <span className={`w-36 text-sm ${STATUS_META[b.current.status].text}`}>{STATUS_META[b.current.status].label} · {ago(b.current.lastReceivedAt, now)}</span>
                <span className="w-24 text-sm text-slate">fw {b.current.firmware ?? "—"}</span>
                <span className="w-44 truncate font-mono text-xs text-slate">{b.previous.length ? `was ${b.previous.map((p) => p.deviceId.slice(0, 8)).join(", ")}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {retiredTokens.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-baseline gap-3.5 border-b border-border px-5 py-4">
            <h2 className="text-lg font-bold text-ink">Retired tokens</h2>
            <span className="text-[13px] text-slate">History only — their readings are kept</span>
          </div>
          <ul className="divide-y divide-[#eef0f2]">
            {retiredTokens.map(({ t, box }) => (
              <li key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-sm">
                <span className="w-44 font-mono text-slate">{t.deviceId}</span>
                <span className="flex-1 text-slate">
                  {box.current.id !== t.id ? <>now <span className="font-mono text-ink">{box.current.apName ?? box.current.deviceId.slice(0, 10)}</span></> : "no successor"}
                  {t.retiredAt ? ` · retired ${athens(t.retiredAt)}` : " · switched off before retirement existed"}
                </span>
                {t.retiredAt && <button onClick={() => unretire(t.id)} className="text-xs text-slate underline">Undo</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {label && (
        <DeviceLabel
          sensor={{ deviceId: label.current.deviceId, name: label.current.siteName, apName: label.current.apName, hardwareId: label.hardwareId }}
          onClose={() => setLabel(null)}
        />
      )}
    </div>
  );
}

function GroupStat({ g, n, sub }: { g: Group; n: number; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[13px] text-slate"><span className={`size-2.5 rounded-sm ${GROUP_META[g].color}`} />{GROUP_META[g].label}</span>
      <span className="text-xl font-bold tabular-nums text-ink">{n}</span>
      <span className="text-xs text-slate">{sub}</span>
    </div>
  );
}

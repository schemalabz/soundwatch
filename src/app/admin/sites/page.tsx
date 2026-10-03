"use client";

// Sites: the stores that should each hold one unit. Design canvas:
// Sites.dc.html. Lists planned sites with their unit's state, the installed
// units that are not linked to a site yet, and a side panel to add or edit a
// site (optionally linking the unit it was started from).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, useAdmin } from "@/components/admin/AdminShell";
import LinkSiteDialog, { type LinkTarget } from "@/components/admin/LinkSiteDialog";
import { StatusDot, ago, athens, boxCode } from "@/components/admin/fleetUi";
import type { AdminSite, SitesResponse, UnlinkedUnit } from "@/lib/api/admin";
import { searchAddress, type AddressHit } from "@/lib/dashboard/geocode";

const STAGE: Record<AdminSite["stage"], { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-ok" },
  watch: { label: "Live · watch", dot: "bg-warn" },
  silent: { label: "Installed, silent", dot: "bg-loud" },
  waiting: { label: "Waiting for a unit", dot: "bg-[#8a8f9c]" },
};

interface Draft {
  id: string | null;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  notes: string;
  /** Link this unit to the new site once it is saved. */
  linkUnit: UnlinkedUnit | null;
}

const EMPTY: Draft = { id: null, name: "", address: "", latitude: "", longitude: "", notes: "", linkUnit: null };

export default function SitesPage() {
  const { api } = useAdmin();
  const [data, setData] = useState<SitesResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [linking, setLinking] = useState<LinkTarget | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    api<SitesResponse>("/api/admin/sites").then(setData, () => setNote("Could not load the sites."));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const sites = data?.sites.filter((s) => s.isActive) ?? [];
  const retired = data?.sites.filter((s) => !s.isActive) ?? [];
  const target = data?.target ?? 50;
  const count = (st: AdminSite["stage"]) => sites.filter((s) => s.stage === st).length;
  const now = data ? new Date(data.generatedAt).getTime() : 0;
  const order: AdminSite["stage"][] = ["silent", "watch", "waiting", "live"];
  const sorted = [...sites].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.name.localeCompare(b.name, "el"));

  function startFromUnit(u: UnlinkedUnit) {
    setDraft({
      ...EMPTY,
      name: u.name ?? "",
      address: u.address ?? "",
      latitude: u.latitude.toFixed(6),
      longitude: u.longitude.toFixed(6),
      linkUnit: u,
    });
  }

  function edit(s: AdminSite) {
    setDraft({ id: s.id, name: s.name, address: s.address ?? "", latitude: String(s.latitude), longitude: String(s.longitude), notes: s.notes ?? "", linkUnit: null });
  }

  return (
    <div className="flex min-h-full">
      <main className="mx-auto flex min-w-0 max-w-[1440px] flex-1 flex-col gap-6 px-6 py-8 lg:px-12">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="text-[30px] font-bold text-ink">Sites</h1>
            <p className="text-[15px] text-slate">The stores that should each hold one unit. A unit linked to a site copies its name and address.</p>
          </div>
          <button onClick={() => setDraft({ ...EMPTY })} className="h-11 rounded-[10px] bg-ink px-[18px] text-sm font-semibold text-white">Add site</button>
        </div>
        {note && <p role="status" className="text-sm font-medium text-ink">{note}</p>}

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-white px-[22px] py-[18px]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-[26px] font-bold tabular-nums text-ink">{data ? sites.length : "—"}</span>
            <span className="text-[15px] text-slate">of {target} target sites known</span>
            <span className="flex-1" />
            {data && data.unlinked.length > 0 && (
              <span className="text-[13px] text-[#96620f]">{data.unlinked.length} installed units are not linked to a site yet</span>
            )}
          </div>
          <div className="flex h-3 overflow-hidden rounded bg-[#eceded]">
            {(["live", "watch", "silent", "waiting"] as const).map((st) => (
              <div key={st} className={STAGE[st].dot} style={{ width: `${(count(st) / target) * 100}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-5 text-[13px] text-slate">
            {(["live", "watch", "silent", "waiting"] as const).map((st) => (
              <span key={st} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${STAGE[st].dot}`} />{STAGE[st].label} · {count(st)}</span>
            ))}
          </div>
        </section>

        {data && data.unlinked.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-[#ecd9b0] bg-[#fbf4e6]">
            <div className="flex flex-col gap-1 px-5 py-4">
              <h2 className="text-base font-bold text-ink">Installed, but not linked to a site</h2>
              <span className="text-sm text-slate">Installed by GPS without picking a store. Link each to its site so it carries the store’s name and counts toward the target.</span>
            </div>
            <ul className="divide-y divide-[#ecd9b0] bg-white">
              {data.unlinked.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <StatusDot status={u.status} />
                  <Link href={`/admin/units/${u.id}`} className="w-36 font-mono text-sm font-medium text-ink">{u.apName ?? u.deviceId.slice(0, 10)}</Link>
                  <span className="min-w-0 flex-1 text-sm text-ink">
                    {u.name ?? <span className="text-slate">no name</span>}
                    <span className="ml-2 font-mono text-xs text-slate">{u.latitude.toFixed(5)}, {u.longitude.toFixed(5)}</span>
                  </span>
                  <span className="text-xs text-slate">installed {athens(u.installedAt)}</span>
                  <button onClick={() => setLinking(u)} className="h-9 rounded-lg border border-silver bg-white px-3 text-sm font-semibold text-ink">Link to a site</button>
                  <button onClick={() => startFromUnit(u)} className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-white">New site here</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="overflow-x-auto rounded-xl border border-border bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_180px_190px_170px_70px] min-w-[720px] gap-4 border-b border-border bg-[#fafafb] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.4px] text-slate">
            <span>Site</span><span>Unit</span><span>Stage</span><span>Store network</span><span />
          </div>
          {data && sorted.length === 0 && <p className="px-5 py-5 text-sm text-slate">No sites yet.</p>}
          {sorted.map((s) => {
            const u = s.units[0];
            return (
              <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_180px_190px_170px_70px] min-w-[720px] items-center gap-4 border-b border-[#eef0f2] px-5 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-ink">{s.name}</span>
                  <span className="truncate text-[13px] text-slate">{s.address ?? `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}</span>
                </div>
                <div className="flex flex-col">
                  {s.units.length === 0 && <span className="font-mono text-[13px] text-[#8a8f9c]">none yet</span>}
                  {s.units.map((x) => (
                    <Link key={x.id} href={`/admin/units/${x.id}`} className="font-mono text-[13px] text-ink">{boxCode(x.apName) ?? x.deviceId.slice(0, 8)}</Link>
                  ))}
                </div>
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <span className={`size-2.5 rounded-full ${STAGE[s.stage].dot}`} />
                  {s.stage === "silent" && u ? `Silent ${ago(u.lastReceivedAt, now).replace(" ago", "")}` : STAGE[s.stage].label}
                </span>
                <span className={`text-[13px] ${u && u.routerRestarts7d >= 2 ? "text-loud" : "text-slate"}`}>
                  {u ? `${u.provider ?? "Unknown"}${u.routerRestarts7d ? ` · ${u.routerRestarts7d} router restarts` : ""}` : "—"}
                </span>
                <button onClick={() => edit(s)} className="text-sm text-slate underline">Edit</button>
              </div>
            );
          })}
        </section>

        {retired.length > 0 && (
          <p className="text-[13px] text-slate">Retired sites: {retired.map((s) => s.name).join(", ")}</p>
        )}
      </main>

      {draft && (
        <SitePanel
          draft={draft}
          setDraft={setDraft}
          onDone={(msg) => { setDraft(null); setNote(msg); load(); }}
        />
      )}
      {linking && data && (
        <LinkSiteDialog
          unit={linking}
          sites={data.sites}
          onClose={() => setLinking(null)}
          onLinked={() => { setLinking(null); setNote("Linked."); load(); }}
        />
      )}
    </div>
  );
}

function SitePanel({ draft, setDraft, onDone }: { draft: Draft; setDraft: (d: Draft | null) => void; onDone: (msg: string) => void }) {
  const { api } = useAdmin();
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasMapbox = Boolean(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN);

  async function lookup() {
    setHits(await searchAddress(draft.address));
  }

  async function save() {
    setBusy(true);
    setError("");
    const body = {
      name: draft.name, address: draft.address, notes: draft.notes,
      latitude: Number(draft.latitude), longitude: Number(draft.longitude),
    };
    try {
      if (draft.id) {
        await api(`/api/admin/locations/${draft.id}`, { method: "PATCH", body: JSON.stringify(body) });
        onDone("Site saved.");
      } else {
        const site = await api<{ id: string }>("/api/admin/locations", { method: "POST", body: JSON.stringify(body) });
        if (draft.linkUnit) {
          await api(`/api/admin/sensors/${draft.linkUnit.id}/site`, { method: "POST", body: JSON.stringify({ siteId: site.id }) });
          onDone(`Site added and ${draft.linkUnit.apName ?? "the unit"} linked to it.`);
        } else {
          onDone("Site added.");
        }
      }
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body as { error?: string } | null)?.error : null;
      setError(msg ?? "Could not save the site.");
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!draft.id || !window.confirm("Retire this site? It disappears from pickers; units linked to it keep the link.")) return;
    await api(`/api/admin/locations/${draft.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    onDone("Site retired.");
  }

  const field = "h-[42px] rounded-[10px] border border-[#d5d7db] px-3 text-sm font-normal";
  return (
    <aside aria-label={draft.id ? "Edit site" : "Add site"} className="fixed inset-0 z-40 flex flex-col bg-white lg:sticky lg:inset-auto lg:top-16 lg:z-auto lg:h-[calc(100vh-4rem)] lg:w-[440px] lg:shrink-0 lg:border-l lg:border-border">
      <div className="flex items-center gap-3 border-b border-[#eef0f2] px-7 pb-4 pt-6">
        <h2 className="flex-1 text-xl font-bold text-ink">{draft.id ? "Edit site" : "Add site"}</h2>
        <button onClick={() => setDraft(null)} aria-label="Close panel" className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-5">
        {draft.linkUnit && (
          <p className="rounded-[10px] bg-[#eef5f0] px-3 py-2.5 text-[13px] text-ink">
            Started from <span className="font-mono">{draft.linkUnit.apName}</span>: its GPS fills the position, and it is linked to the site on save.
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
          Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Skroutz Δάφνη" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
          Address
          <span className="flex gap-2">
            <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Ηπείρου 18, Δάφνη 172 37" className={`${field} min-w-0 flex-1`} />
            {hasMapbox && <button type="button" onClick={lookup} className="h-[42px] rounded-[10px] border border-silver px-3 text-sm font-semibold">Find</button>}
          </span>
        </label>
        {hits.length > 0 && (
          <ul className="overflow-hidden rounded-[10px] border border-border">
            {hits.map((h) => (
              <li key={`${h.lng},${h.lat}`}>
                <button
                  onClick={() => { setDraft({ ...draft, address: h.label, latitude: h.lat.toFixed(6), longitude: h.lng.toFixed(6) }); setHits([]); }}
                  className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="text-ink">{h.label}</span>
                  {h.context && <span className="text-xs text-slate">{h.context}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!hasMapbox && (
          <p className="text-xs text-slate">Address lookup needs a Mapbox token (NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN); enter the position by hand.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            Latitude
            <input inputMode="decimal" value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: e.target.value })} className={`${field} tabular-nums`} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            Longitude
            <input inputMode="decimal" value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: e.target.value })} className={`${field} tabular-nums`} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
          Notes
          <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="resize-none rounded-[10px] border border-[#d5d7db] px-3 py-2.5 text-sm font-normal" />
        </label>
        {draft.id && (
          <button onClick={retire} className="w-fit text-sm text-loud underline">Retire this site</button>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-[#eef0f2] px-7 pb-6 pt-4">
        {error && <p role="alert" className="text-sm text-loud">{error}</p>}
        <div className="flex gap-2.5">
          <button onClick={() => setDraft(null)} className="h-11 flex-1 rounded-[10px] border border-silver text-sm font-semibold text-ink">Cancel</button>
          <button onClick={save} disabled={busy || !draft.name.trim() || !draft.latitude || !draft.longitude} className="h-11 flex-[2] rounded-[10px] bg-ink text-sm font-semibold text-white disabled:opacity-50">
            {draft.id ? "Save site" : draft.linkUnit ? "Save site and link unit" : "Save site"}
          </button>
        </div>
      </div>
    </aside>
  );
}

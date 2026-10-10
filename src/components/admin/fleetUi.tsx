// Small shared pieces of the admin fleet surfaces.
import type { CellState, FleetStatus } from "@/lib/fleet/status";
import { needsCharge } from "@/lib/fleet/status";

export const STATUS_META: Record<FleetStatus, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-ok", text: "text-ink" },
  watch: { label: "Watch", dot: "bg-warn", text: "text-[#96620f]" },
  silent: { label: "Silent", dot: "bg-loud", text: "text-loud" },
  in_box: { label: "In box", dot: "bg-slate", text: "text-slate" },
  with_installer: { label: "With installer", dot: "bg-[#6f7a90]", text: "text-slate" },
  minted: { label: "Minted", dot: "bg-silver", text: "text-slate" },
  bench: { label: "Bench", dot: "bg-[#9aa3b5]", text: "text-slate" },
  retired: { label: "Retired", dot: "bg-[#dcdde0]", text: "text-slate" },
};

const CELL_CLASS: Record<CellState, string> = {
  live: "bg-ok",
  offline: "bg-warn",
  silent: "bg-loud",
  none: "bg-[#eceded]",
};

const CELL_WORD: Record<CellState, string> = {
  live: "live",
  offline: "measured offline, uploaded later",
  silent: "silent",
  none: "not installed",
};

export function StatusDot({ status, className = "" }: { status: FleetStatus; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${STATUS_META[status].dot} ${className}`} />;
}

/** 30 days of 12-hour cells. Accessible as one summary line, not 60 cells. */
export function Strip({ cells, label }: { cells: CellState[]; label: string }) {
  const counts = cells.reduce<Record<CellState, number>>((a, c) => ({ ...a, [c]: a[c] + 1 }), { live: 0, offline: 0, silent: 0, none: 0 });
  const summary = `${label}, last 30 days: ${counts.live} live, ${counts.offline} offline, ${counts.silent} silent half-days`;
  return (
    <div role="img" aria-label={summary} className="flex h-[18px] items-stretch gap-px">
      {cells.map((c, i) => (
        <span key={i} title={CELL_WORD[c]} className={`w-1 rounded-[1px] ${CELL_CLASS[c]}`} />
      ))}
    </div>
  );
}

export function StripLegend() {
  return (
    <div className="flex flex-wrap gap-5 text-xs text-slate">
      {(["live", "offline", "silent", "none"] as CellState[]).map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[2px] ${CELL_CLASS[c]}`} />
          {c === "none" ? "No data / not installed" : CELL_WORD[c][0].toUpperCase() + CELL_WORD[c].slice(1)}
        </span>
      ))}
    </div>
  );
}

/** "now", "12 min ago", "21 hours ago", "20 days ago". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return "now";
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const ATHENS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Athens", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

/** "29 Sept, 17:54" in Athens time. */
export function athens(iso: string | null): string {
  return iso ? ATHENS.format(new Date(iso)) : "—";
}

/** Short box code from the setup-AP name: "Soundwatch-05F3" → "05F3". */
export function boxCode(apName: string | null): string | null {
  return apName?.replace(/^Soundwatch-/i, "") ?? null;
}

/** A box to charge before it ships. The battery is the box's last reading —
 *  for a boxed unit, from the day it was flashed — so the chip says when. */
export function ChargeChip({ battery, at }: { battery: number | null; at: string | null }) {
  if (!needsCharge(battery)) return null;
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-[#fbe7e5] px-2 py-0.5 text-[11px] font-semibold text-loud">
      Charge first · {Math.round(battery!)}%{at ? ` on ${athens(at).split(",")[0]}` : ""}
    </span>
  );
}

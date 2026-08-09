"use client";

// Network status: every sensor with its last-hour liveness dot, uptime
// percentage and a 30-day liveness strip (6h cells). Problems float to the
// top, outages are painted (not just absent), and the header carries the
// fleet-wide availability. Public, honest, quiet.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fmtDb } from "@/lib/dashboard/format";

interface StatusSensor {
  id: string;
  deviceId: string;
  name: string | null;
  secondsAgo: number | null;
  cells: string;
}

interface StatusResponse {
  bucketHours: number;
  windowDays: number;
  sensors: StatusSensor[];
  ingest?: { days: number; hours: { t: number; n: number }[] };
}

const ONLINE_S = 3600;

function ago(s: number | null): string {
  if (s == null) return "ποτέ";
  if (s < 90) return `πριν ${s}δ`;
  if (s < 5400) return `πριν ${Math.round(s / 60)}λ`;
  if (s < 90000) return `πριν ${Math.round(s / 3600)}ω`;
  return `πριν ${Math.round(s / 86400)}ημ`;
}

function uptime(cells: string): number {
  if (cells.length === 0) return 0;
  return [...cells].filter((c) => c === "1").length / cells.length;
}

function LivenessStrip({ cells }: { cells: string }) {
  const n = cells.length;
  return (
    <svg viewBox={`0 0 ${n} 8`} preserveAspectRatio="none" className="h-3.5 w-full min-w-40" aria-hidden>
      {[...cells].map((c, i) =>
        c === "1" ? (
          <rect key={i} x={i + 0.08} y={0} width={0.84} height={8} rx={0.3} fill="var(--sw-slate)" opacity={0.7} />
        ) : (
          // An outage is information, not absence — paint it.
          <rect key={i} x={i + 0.08} y={2.2} width={0.84} height={3.6} rx={0.3} fill="var(--sw-loud)" opacity={0.3} />
        )
      )}
    </svg>
  );
}

/** Hourly ingest bars over the last days; the current (partial) hour fades. */
function IngestChart({ hours }: { hours: { t: number; n: number }[] }) {
  const n = hours.length;
  if (n === 0) return null;
  // Square-root scale: ingest cadence can differ by an order of magnitude
  // (the local sim streams at 5s against a 60s backfill) and a linear scale
  // would flatten the normal regime to nothing.
  const max = Math.max(...hours.map((h) => Math.sqrt(h.n)));
  const dayFmt = new Intl.DateTimeFormat("el", { weekday: "short" });
  // A label at each local midnight.
  const dayTicks = hours.map((h, i) => ({ i, isMidnight: new Date(h.t).getHours() === 0 })).filter((x) => x.isMidnight);
  return (
    <div>
      <svg viewBox={`0 0 ${n} 40`} preserveAspectRatio="none" className="h-16 w-full" aria-hidden>
        {hours.map((h, i) => {
          const bh = max > 0 ? (Math.sqrt(h.n) / max) * 38 : 0;
          return (
            <rect
              key={h.t}
              x={i + 0.12}
              y={40 - bh}
              width={0.76}
              height={bh}
              rx={0.3}
              fill="var(--sw-slate)"
              opacity={i === n - 1 ? 0.35 : 0.7}
            >
              <title>{`${new Date(h.t).toLocaleString("el", { weekday: "short", hour: "2-digit" })}: ${h.n.toLocaleString("el")} μετρήσεις`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="relative mt-0.5 h-3.5 text-[9px] uppercase text-muted-foreground/70">
        {dayTicks.map(({ i }) => (
          <span key={i} className="absolute -translate-x-1/2" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
            {dayFmt.format(hours[i].t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: on ? "var(--sw-ok)" : "var(--sw-loud)" }}
      title={on ? "Ενεργός την τελευταία ώρα" : "Εκτός λειτουργίας"}
    />
  );
}

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/status", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => !cancelled && setData(d))
        .catch(() => !cancelled && setError(true));
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Problems first, then alphabetical — a status page leads with what's wrong.
  const sensors = useMemo(() => {
    const list = [...(data?.sensors ?? [])];
    const isOn = (s: StatusSensor) => s.secondsAgo != null && s.secondsAgo < ONLINE_S;
    return list.sort((a, b) => Number(isOn(a)) - Number(isOn(b)) || (a.name ?? "").localeCompare(b.name ?? "", "el"));
  }, [data]);

  const online = sensors.filter((s) => s.secondsAgo != null && s.secondsAgo < ONLINE_S).length;
  const fleetUptime = sensors.length > 0 ? sensors.reduce((sum, s) => sum + uptime(s.cells), 0) / sensors.length : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Χάρτης
          </Link>
          <div className="text-[13px] font-bold tracking-tight">
            soundwatch<span className="text-sound">.</span>
          </div>
        </div>

        <h1 className="text-xl font-bold tracking-tight">Κατάσταση δικτύου</h1>

        {/* fleet summary: the three numbers that matter */}
        {data && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-[13px] text-muted-foreground">
              <span
                className="text-[19px] font-bold tabular-nums tracking-tight"
                style={online < sensors.length ? { color: "var(--sw-loud)" } : undefined}
              >
                {online}/{sensors.length}
              </span>{" "}
              ενεργοί
            </span>
            <span className="text-[13px] text-muted-foreground">
              <span className="text-[19px] font-bold tabular-nums tracking-tight text-foreground">
                {fmtDb(fleetUptime * 100)}%
              </span>{" "}
              διαθεσιμότητα {data.windowDays} ημερών
            </span>
            <span className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-[2px]" style={{ backgroundColor: "var(--sw-slate)", opacity: 0.7 }} />
                σε λειτουργία
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-3 rounded-[2px]" style={{ backgroundColor: "var(--sw-loud)", opacity: 0.35 }} />
                εκτός
              </span>
            </span>
          </div>
        )}

        {error && <p className="mt-8 text-sm text-destructive">Σφάλμα φόρτωσης — δοκιμάστε ξανά.</p>}

        {/* ingest volume */}
        {data?.ingest && data.ingest.hours.length > 0 && (
          <div className="mt-6 rounded-xl border bg-card px-4 pb-2 pt-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
                Μετρήσεις ανά ώρα · {data.ingest.days} ημέρες
              </h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                σύνολο {data.ingest.hours.reduce((s, h) => s + h.n, 0).toLocaleString("el")}
              </span>
            </div>
            <IngestChart hours={data.ingest.hours} />
          </div>
        )}

        <div className="mt-6 rounded-xl border bg-card">
          {/* column headers, aligned to the row grid */}
          <div className="flex items-center gap-3 border-b px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
            <span className="size-2 shrink-0" />
            <span className="w-40 shrink-0">Αισθητήρας</span>
            <span className="w-14 shrink-0 text-right">Μέτρηση</span>
            <span className="flex min-w-0 flex-1 justify-between max-md:hidden">
              <span>{data ? `${data.windowDays} ημέρες πριν` : ""}</span>
              <span>τώρα</span>
            </span>
            <span className="w-12 shrink-0 text-right">Διαθ.</span>
          </div>

          <div className="divide-y">
            {sensors.map((s) => {
              const on = s.secondsAgo != null && s.secondsAgo < ONLINE_S;
              const pct = uptime(s.cells);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-1.5 transition-colors hover:bg-secondary/50 max-md:flex-wrap">
                  <Dot on={on} />
                  <div className="w-40 shrink-0 truncate">
                    <span className="text-[13px] font-medium leading-tight">{s.name ?? s.deviceId}</span>
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {ago(s.secondsAgo)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <LivenessStrip cells={s.cells} />
                  </div>
                  <span
                    className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums"
                    style={{ color: pct < 0.98 ? "var(--sw-loud)" : "var(--sw-ok)" }}
                  >
                    {fmtDb(pct * 100)}%
                  </span>
                </div>
              );
            })}
            {!data &&
              !error &&
              Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="h-4 animate-pulse rounded bg-silver/30" />
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

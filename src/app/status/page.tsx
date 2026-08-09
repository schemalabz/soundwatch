"use client";

// Network status: every sensor with its last-hour liveness dot and a
// 30-day liveness strip (6h cells). Public, honest, quiet.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

function ago(s: number | null): string {
  if (s == null) return "ποτέ";
  if (s < 90) return `πριν ${s}δ`;
  if (s < 5400) return `πριν ${Math.round(s / 60)}λ`;
  if (s < 90000) return `πριν ${Math.round(s / 3600)}ω`;
  return `πριν ${Math.round(s / 86400)}ημ`;
}

function LivenessStrip({ cells }: { cells: string }) {
  const n = cells.length;
  return (
    <svg viewBox={`0 0 ${n} 8`} preserveAspectRatio="none" className="h-3.5 w-full min-w-40" aria-hidden>
      {[...cells].map((c, i) =>
        c === "1" ? <rect key={i} x={i + 0.08} y={0} width={0.84} height={8} rx={0.3} fill="var(--sw-slate)" opacity={0.75} /> : null
      )}
    </svg>
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
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const online = data?.sensors.filter((s) => s.secondsAgo != null && s.secondsAgo < 3600).length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Χάρτης
        </Link>

        <div className="mb-1 flex items-baseline gap-2">
          <h1 className="text-xl font-bold tracking-tight">Κατάσταση δικτύου</h1>
          <span className="size-[5px] translate-y-[-2px] rounded-full bg-sound" />
        </div>
        {data && (
          <p className="text-[13px] text-muted-foreground">
            {online} από {data.sensors.length} αισθητήρες ενεργοί την τελευταία ώρα · ιστορικό {data.windowDays} ημερών
          </p>
        )}

        {error && <p className="mt-8 text-sm text-destructive">Σφάλμα φόρτωσης — δοκιμάστε ξανά.</p>}

        <div className="mt-7 space-y-1.5">
          {/* strip legend */}
          {data && (
            <div className="mb-1 flex justify-between pl-[13.5rem] pr-0 text-[9.5px] uppercase tracking-wide text-muted-foreground/70 max-md:hidden">
              <span>{data.windowDays} ημέρες πριν</span>
              <span>τώρα</span>
            </div>
          )}
          {(data?.sensors ?? []).map((s) => {
            const on = s.secondsAgo != null && s.secondsAgo < 3600;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-secondary/60 max-md:flex-wrap">
                <span
                  className={cn("size-2 shrink-0 rounded-full", on ? "bg-sound" : "bg-silver")}
                  title={on ? "Ενεργός την τελευταία ώρα" : "Ανενεργός"}
                />
                <div className="w-40 shrink-0 truncate">
                  <span className="text-[13px] font-medium leading-tight">{s.name ?? s.deviceId}</span>
                </div>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{ago(s.secondsAgo)}</span>
                <div className="min-w-0 flex-1">
                  <LivenessStrip cells={s.cells} />
                </div>
              </div>
            );
          })}
          {!data && !error && <p className="text-sm text-muted-foreground">Φόρτωση…</p>}
        </div>
      </div>
    </div>
  );
}

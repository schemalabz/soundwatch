"use client";

// The admin frame: one login (the admin token, kept in localStorage under the
// key the sensor page also reads), one header, and an authenticated fetch for
// every page beneath it. A 401 anywhere logs out everywhere.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/adminToken";

interface AdminCtx {
  token: string;
  /** fetch + Bearer token + JSON; throws on non-2xx (a 401 also logs out). */
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  logout: () => void;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin outside AdminShell");
  return c;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`);
  }
}

const NAV = [
  { href: "/admin", label: "Fleet" },
  { href: "/admin/sites", label: "Sites" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/inventory", label: "Inventory" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const pathname = usePathname();

  // Deferred a microtask so the effect body itself never sets state.
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setToken(localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
      } catch {
        /* storage blocked: stay logged out */
      }
      setChecked(true);
    });
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); } catch { /* ignore */ }
    setToken(null);
  }, []);

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await res.json().catch(() => null);
    if (res.status === 401) logout();
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
  }, [token, logout]);

  const ctx = useMemo(() => (token ? { token, api, logout } : null), [token, api, logout]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/fleet", { headers: { Authorization: `Bearer ${draft}` } });
    if (!res.ok) { setError("That token was not accepted."); return; }
    try { localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, draft); } catch { /* ignore */ }
    setError("");
    setToken(draft);
  }

  if (!checked) return null;

  if (!ctx) {
    return (
      <div className="mx-auto mt-24 w-full max-w-sm px-6">
        <h1 className="mb-6 text-2xl font-bold text-ink">Soundwatch admin</h1>
        <form onSubmit={login} className="space-y-3">
          <label className="block text-sm font-medium text-slate">
            Admin token
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          {error && <p className="text-sm text-loud">{error}</p>}
          <button type="submit" className="h-11 w-full rounded-lg bg-ink font-semibold text-white">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex min-h-full flex-col bg-background">
        <header className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-x-8 bg-ink px-4 text-white sm:px-6 lg:h-16 lg:flex-nowrap lg:px-12">
          <Link href="/admin" className="flex h-14 items-center gap-2.5 lg:h-auto">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--sw-sound)" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 11v0M7 7v8M11 3v16M15 7v8M19 10v2" /></svg>
            <span className="text-[17px] font-bold">Soundwatch</span>
            <span className="hidden rounded-md border border-slate px-2 py-0.5 text-xs text-silver sm:inline">Admin</span>
          </Link>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto pb-2 text-sm font-medium lg:order-none lg:mx-0 lg:w-auto lg:pb-0" aria-label="Admin sections">
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/units") : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-lg px-3.5 py-2 ${active ? "bg-slate text-white" : "text-[#d6d8dc] hover:bg-white/10"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          <Link href="/admin/classic" className="text-xs text-silver hover:text-white">Classic view</Link>
          <button onClick={logout} className="text-xs text-silver hover:text-white">Sign out</button>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </Ctx.Provider>
  );
}

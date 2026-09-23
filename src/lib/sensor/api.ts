import { SHARE_KEY_PARAM, type ApiReadingsResponse, type ApiSensorDetail } from "@/lib/api/schemas";
import { authHeaders } from "@/lib/adminToken";

// The page's three requests. Two credentials ride along: the admin token
// from localStorage (see src/lib/adminToken.ts), and the share key from the
// page URL. Either may be absent; public sensors need neither.

function withKey(params: URLSearchParams, key: string | null): void {
  if (key) params.set(SHARE_KEY_PARAM, key);
}

/** Where a sensor's live page lives. The admin list, the admin edit panel and
 *  the share-link builder all route through here instead of each spelling
 *  `/sensors/${id}` again. */
export function sensorPagePath(id: string): string {
  return `/sensors/${id}`;
}

/**
 * An absolute share link: the live page plus its key. `base` is the origin to
 * resolve against — NEXT_PUBLIC_BASE_URL on the server, window.location.origin
 * in the admin page.
 *
 * Built with searchParams, not string concatenation: a share key is
 * base64url today, but a key that ever contains a `+`, `/` or `=` must arrive
 * at the gate byte-for-byte, and `?k=${key}` does not guarantee that.
 */
export function sensorShareUrl(id: string, key: string, base: string): string {
  const url = new URL(sensorPagePath(id), base);
  url.searchParams.set(SHARE_KEY_PARAM, key);
  return url.toString();
}

export function detailUrl(id: string, key: string | null): string {
  const params = new URLSearchParams();
  withKey(params, key);
  const q = params.toString();
  return `/api/sensors/${id}${q ? `?${q}` : ""}`;
}

/**
 * `fromMs` filters the DEVICE clock (recordedAt) — chart-axis semantics.
 * `receivedFromMs` filters the SERVER clock (receivedAt) — what a live window
 * wants, since a row can arrive hours after its device stamp.
 */
export function readingsUrl(
  id: string,
  key: string | null,
  opts: { fromMs?: number; receivedFromMs?: number; limit?: number; format?: "json" | "csv" } = {}
): string {
  const params = new URLSearchParams();
  if (opts.fromMs != null) params.set("from", new Date(opts.fromMs).toISOString());
  if (opts.receivedFromMs != null) params.set("receivedFrom", new Date(opts.receivedFromMs).toISOString());
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.format) params.set("format", opts.format);
  withKey(params, key);
  const q = params.toString();
  return `/api/sensors/${id}/readings${q ? `?${q}` : ""}`;
}

export async function fetchDetail(id: string, key: string | null): Promise<ApiSensorDetail | null> {
  const res = await fetch(detailUrl(id, key), { cache: "no-store", headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`detail ${res.status}`);
  return (await res.json()) as ApiSensorDetail;
}

export async function fetchReadings(
  id: string,
  key: string | null,
  opts: { fromMs?: number; receivedFromMs?: number; limit?: number }
): Promise<ApiReadingsResponse> {
  const res = await fetch(readingsUrl(id, key, opts), { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error(`readings ${res.status}`);
  return (await res.json()) as ApiReadingsResponse;
}

/**
 * Download the window as CSV. Fetched, not linked: the admin path needs a header.
 *
 * The basis MUST be `receivedFromMs`, the same one `trimToWindow` uses to trim
 * the log — the file has to be the rows the table is showing. Filtering on
 * `from` (the device clock) instead silently hands the user a different set of
 * rows, and on a sensor whose clock has drifted, or that replayed a backlog,
 * the two sets diverge wildly.
 */
export async function downloadCsv(id: string, key: string | null, receivedFromMs: number): Promise<void> {
  const res = await fetch(readingsUrl(id, key, { receivedFromMs, limit: 10000, format: "csv" }), {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`csv ${res.status}`);
  const disposition = res.headers.get("content-disposition") ?? "";
  // RFC 6266: prefer the UTF-8 form (filename*=) so a Greek sensor name
  // survives; fall back to the plain quoted ASCII form.
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="([^"]+)"/.exec(disposition);
  const filename = star ? decodeURIComponent(star[1]) : plain?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "soundwatch.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

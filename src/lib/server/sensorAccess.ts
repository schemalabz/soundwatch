import { randomBytes, timingSafeEqual } from "crypto";
import { checkAdminAuth } from "@/app/api/admin/auth";
import { SHARE_KEY_PARAM } from "@/lib/api/schemas";

// Who may read ONE sensor's detail and readings. Three credentials, one
// answer, so the readings route and the detail route cannot drift apart —
// they used to carry the same inline `isExperimental && !admin` check twice.
//
//   public sensor   → anyone
//   admin token     → any sensor
//   share key (?k=) → that sensor only, read-only
//
// A failed gate is a 404 at the caller, never a 403: bench units must stay
// unconfirmable without a credential.

/** 16 random bytes, base64url: 22 characters, safe in a URL unquoted. */
export function generateShareKey(): string {
  return randomBytes(16).toString("base64url");
}

/** Constant-time compare. A missing key on either side never matches. */
export function shareKeyMatches(provided: string | null, actual: string | null): boolean {
  if (!provided || !actual) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ViewableSensor {
  isExperimental: boolean;
  shareKey: string | null;
}

/**
 * Headers every response that passed through `canViewSensor` must carry.
 *
 * These paths changed category when the share key landed: they used to serve
 * only public data, and now they serve a bench unit's data to an Authorization
 * header or a ?k= share key on the SAME URL that 404s everyone else. Without
 * these headers a shared cache (CDN, reverse proxy, corporate proxy) may store
 * an authorised response and hand it to an anonymous client. Every response
 * carries them — the 200s, the 404 and the 400 alike, because a cached 404 is
 * a wrong answer to a credentialed caller just as surely.
 *
 * The invariant belongs to the gate, not to either route: it was declared
 * verbatim in both, which is one copy away from a route forgetting it.
 */
export const NO_SHARED_CACHE = {
  "cache-control": "no-store",
  vary: "authorization",
} as const;

export function canViewSensor(request: Request, sensor: ViewableSensor): boolean {
  if (!sensor.isExperimental) return true;
  if (checkAdminAuth(request) === null) return true;
  // The LAST ?k=, not the first. A repeated parameter is never a bypass — a
  // wrong key admits nobody whichever one is read — but the gate and the zod
  // parser must not read the same query string by different rules. The parser
  // sees Object.fromEntries(searchParams), where the last value wins; .get()
  // here took the first, so `?k=valid&k=junk` was a 200 and `?k=junk&k=valid`
  // a 404. Two components disagreeing about what a URL says is the kind of
  // gap a proxy that reorders parameters turns into a real one.
  const values = new URL(request.url).searchParams.getAll(SHARE_KEY_PARAM);
  return shareKeyMatches(values.at(-1) ?? null, sensor.shareKey);
}

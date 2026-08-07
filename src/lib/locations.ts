// Pure decision logic for planned deployment sites. Route handlers stay thin;
// everything with a truth table lives here, where vitest can reach it.

export const LIVE_WINDOW_MS = 5 * 60 * 1000;

// What "a sensor exists" means to the PUBLIC (map, leaderboard): active, not a
// bench/experimental unit, and actually somewhere. Without the last two clauses
// the homepage showed every minted token and the whole bench fleet as nameless
// ghost sensors. installedAt is deliberately not required: a legacy sensor with
// real coordinates but no install-flow record (sck-exarchia) stays visible.
export const PUBLIC_SENSOR_WHERE = {
  isActive: true,
  isExperimental: false,
  latitude: { not: null },
} as const;

export type SensorStage = "minted" | "in_box" | "installed_live" | "installed_silent" | "bench";

export type ImportRow = {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  notes?: string;
  // Retirement travels through the same import: re-send a row with
  // isActive:false and the site disappears from pickers while historical
  // bindings keep their FK. Omitted = leave the stored value untouched.
  isActive?: boolean;
};

// Greek site names are the common case — keep unicode letters, collapse
// everything else to single hyphens.
export function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseImportRows(body: unknown): { rows: ImportRow[] } | { error: string } {
  if (!Array.isArray(body)) return { error: "body must be an array of locations" };
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < body.length; i++) {
    const r = body[i] as Record<string, unknown>;
    const name = typeof r?.name === "string" ? r.name.trim() : "";
    if (!name) return { error: `row ${i}: name is required` };
    const latitude = Number(r.latitude);
    const longitude = Number(r.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return { error: `row ${i}: valid latitude and longitude required` };
    }
    const key = typeof r.key === "string" && r.key.trim() ? r.key.trim() : slugifyKey(name);
    if (!key) return { error: `row ${i}: key is empty after slugify` };
    if (seen.has(key)) return { error: `row ${i}: duplicate key "${key}" in import` };
    seen.add(key);
    rows.push({
      key,
      name,
      latitude,
      longitude,
      ...(typeof r.address === "string" && r.address ? { address: r.address } : {}),
      ...(typeof r.notes === "string" && r.notes ? { notes: r.notes } : {}),
      ...(typeof r.isActive === "boolean" ? { isActive: r.isActive } : {}),
    });
  }
  return { rows };
}

// in_box deliberately ignores lastSeenAt: a field unit publishes during its
// office prove phase, and that must not make a boxed unit look like a dead
// deployment.
//
// Experimental (bench) units get one neutral stage: "installed" can never
// happen to them, so lifecycle words like in_box carry no signal — and
// liveness is the status dot's job, not the badge's.
export function computeStage(
  s: {
    provisionedAt: Date | null;
    installedAt: Date | null;
    lastSeenAt: Date | null;
    isExperimental?: boolean;
  },
  now: Date
): SensorStage {
  if (s.isExperimental) return "bench";
  if (!s.provisionedAt && !s.installedAt) return "minted";
  if (!s.installedAt) return "in_box";
  const live = s.lastSeenAt != null && now.getTime() - s.lastSeenAt.getTime() < LIVE_WINDOW_MS;
  return live ? "installed_live" : "installed_silent";
}

// Two independent conflicts, two independent confirmations:
//   force          -> "yes, overwrite THIS sensor's existing location"
//   acceptOccupied -> "yes, this SITE already has a unit, bind anyway"
export function decideLocationWrite(a: {
  sensorHasLocation: boolean;
  force: boolean;
  siteOccupiedByOther: boolean;
  acceptOccupied: boolean;
}): { ok: true } | { ok: false; status: 409; error: "already_located" | "site_occupied" } {
  if (a.sensorHasLocation && !a.force) return { ok: false, status: 409, error: "already_located" };
  if (a.siteOccupiedByOther && !a.acceptOccupied) return { ok: false, status: 409, error: "site_occupied" };
  return { ok: true };
}

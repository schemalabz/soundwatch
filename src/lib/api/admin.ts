// Response contracts for the admin fleet surfaces. The routes are annotated
// with these and the pages import them, so a renamed field fails to compile
// instead of arriving as undefined (same pattern as lib/api/dashboard.ts).
import type { CellState, FleetStatus, SilentCause } from "@/lib/fleet/status";

export interface FleetNetwork {
  /** Latest public IP the unit connected from (broker log). */
  ip: string | null;
  /** "Nova", "Cyta", "OTE"… from reverse DNS / registry; null = unknown. */
  provider: string | null;
  /** Reverse DNS says static (e.g. static…hol.gr); false = dynamic pool; null = unknown. */
  staticIp: boolean | null;
  /** Distinct public IPs over the last 7 days. */
  ips7d: number;
  /** Connects from a NEW public IP in the last 7 days = store router restarts. */
  routerRestarts7d: number;
}

export interface FleetUnit {
  id: string;
  deviceId: string;
  apName: string | null;
  hardwareId: string | null;
  name: string | null;
  address: string | null;
  site: { id: string; name: string } | null;
  latitude: number | null;
  longitude: number | null;
  status: FleetStatus;
  /** Why "watch" (or empty). */
  watchReasons: string[];
  /** For silent units: what the last readings say. */
  silentCause: SilentCause | null;
  lastReceivedAt: string | null;
  provisionedAt: string | null;
  installedAt: string | null;
  handedOverAt: string | null;
  retiredAt: string | null;
  supersededBy: { id: string; deviceId: string } | null;
  firmware: string | null;
  /** 12-hour cells, oldest first, covering the last 30 days. */
  cells: CellState[];
  /** Share of hours since max(install, 7 days ago) with any reading; null when not installed. */
  completeness7d: number | null;
  rssiAvg24h: number | null;
  rssiMin7d: number | null;
  batteryLast: number | null;
  unscheduledBoots7d: number;
  /** Energy-average level over 7 days (LAeq), from the level rollup. */
  laeq7d: number | null;
  network: FleetNetwork;
}

export interface FleetResponse {
  generatedAt: string;
  cellHours: number;
  windowDays: number;
  units: FleetUnit[];
}

export interface InventoryToken {
  id: string;
  deviceId: string;
  apName: string | null;
  isExperimental: boolean;
  createdAt: string;
  retiredAt: string | null;
  isActive: boolean;
}

export interface InventoryBox {
  key: string;
  hardwareId: string | null;
  current: InventoryToken & {
    status: FleetStatus;
    provisionedAt: string | null;
    handedOverAt: string | null;
    installedAt: string | null;
    lastReceivedAt: string | null;
    siteName: string | null;
    firmware: string | null;
    batteryLast: number | null;
    rssiAvg: number | null;
    bench: { verdict: "passed" | "short" | "none"; text: string } | null;
  };
  previous: InventoryToken[];
  /** Older tokens still active: retire these. */
  duplicates: InventoryToken[];
}

export interface InventoryResponse {
  generatedAt: string;
  target: number;
  boxes: InventoryBox[];
}

export interface SiteUnit {
  id: string;
  deviceId: string;
  apName: string | null;
  status: FleetStatus;
  lastReceivedAt: string | null;
  provider: string | null;
  routerRestarts7d: number;
}

export interface AdminSite {
  id: string;
  key: string;
  name: string;
  address: string | null;
  notes: string | null;
  latitude: number;
  longitude: number;
  isActive: boolean;
  units: SiteUnit[];
  /** live / watch / silent from its best unit; waiting = no unit yet. */
  stage: "live" | "watch" | "silent" | "waiting";
}

/** An installed unit with coordinates but no site — candidates for linking. */
export interface UnlinkedUnit {
  id: string;
  deviceId: string;
  apName: string | null;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  status: FleetStatus;
  installedAt: string | null;
}

export interface SitesResponse {
  generatedAt: string;
  target: number;
  sites: AdminSite[];
  unlinked: UnlinkedUnit[];
}

export interface UnitHour {
  /** Hour start, ISO. */
  t: string;
  n: number;
  onTime: number;
  rssiAvg: number | null;
  batteryMin: number | null;
  batteryMax: number | null;
}

export interface UnitEvent {
  at: string;
  kind: "boot" | "connect" | "disconnect";
  ip?: string;
  /** connect: the unit came back from a different public IP than last time. */
  newIp?: boolean;
  reason?: string;
  scheduled?: boolean;
  uptimeBefore?: number;
  resetCause?: number | null;
}

export interface UnitDetailResponse {
  generatedAt: string;
  unit: FleetUnit;
  identity: {
    hardwareId: string | null;
    readingIntervalS: number;
    targetFirmwareVersion: string | null;
    firmwareVersion: string | null;
    samGitHash: string | null;
    espGitHash: string | null;
    createdAt: string;
    isActive: boolean;
    isExperimental: boolean;
    shareKey: string | null;
    previousTokens: { id: string; deviceId: string; retiredAt: string | null }[];
  };
  /** Hourly health over the last 7 days (device-time buckets). */
  hours: UnitHour[];
  /** Newest first, last 14 days. */
  events: UnitEvent[];
  ipInfo: Record<string, { provider: string | null; ptr: string | null; staticIp: boolean | null }>;
  lastReading: { receivedAt: string; battery: number | null; rssi: number | null; uptimeS: number | null; laeq: number | null } | null;
  diagnosis: { headline: string; evidence: { claim: string; detail: string; supports: boolean }[]; ask: string[] } | null;
}

// When is a sensor "live"? One answer for every screen. The sensor pane and
// the sensor page colour a dot by it; /status counts "ενεργοί" by the stale
// bound. Age ALWAYS reads receivedAt: a device clock 35 min fast would make
// a dead unit look fresh and a healthy one look stale after an NTP resync.
// Public screens only: the admin's lifecycle and silent bound, and the
// installer's, are in lib/fleet/status.

export const LIVE_S = 120;
export const STALE_S = 3600;
/** Silent longer than this = left the network, not just quiet this morning.
 *  The live rail counts these apart from the merely silent. */
export const OFFLINE_S = 7 * 86_400;

export type LiveTone = "live" | "stale" | "dead" | "never";

/** The palette's meaning: ok = talking now, slate = quiet, loud = gone, silver = never was. */
export const LIVE_TONE_COLOR: Record<LiveTone, string> = {
  live: "var(--sw-ok)",
  stale: "var(--sw-slate)",
  dead: "var(--sw-loud)",
  never: "var(--sw-silver)",
};

export function liveTone(ageS: number | null): LiveTone {
  if (ageS == null) return "never";
  return ageS < LIVE_S ? "live" : ageS < STALE_S ? "stale" : "dead";
}

export function liveStatus(receivedAtIso: string | null, nowMs: number): { ageS: number | null; tone: LiveTone } {
  if (!receivedAtIso) return { ageS: null, tone: "never" };
  const ageS = Math.max(0, Math.round((nowMs - Date.parse(receivedAtIso)) / 1000));
  return { ageS, tone: liveTone(ageS) };
}

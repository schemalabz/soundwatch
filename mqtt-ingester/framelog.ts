// SD-path v1: raw FRAMELOG.CSV bytes pulled from a device over MQTT.
//
// The server publishes {"act":"framelog","off":N,"n":k} on the device's cmd
// topic; the device answers on device/sck/<token>/framelog with chunks of the
// raw file, each "<byte-offset>|<bytes>", ending with "EOF|<filesize>".
// Offsets are exact raw-file positions, which makes the transfer resumable
// (ask again from where you stopped) and idempotent (chunks are immutable —
// storing one twice changes nothing). Reassembly is string_agg over offsets.

// Two wire namespaces coexist:
//   day-rotated (>=127691b):  "<yymmdd>|<off>|<bytes>"  /  "EOF|<yymmdd>|<size>"
//   legacy single-file:       "<off>|<bytes>"            /  "EOF|<size>"
// day = "" marks the legacy namespace so (device, day, offset) stays unique.
export type ParsedFrameLogChunk =
  | { kind: "chunk"; day: string; offset: number; data: string }
  | { kind: "eof"; day: string; size: number };

const DAY_RE = /^\d{6}$/;

export function parseFrameLogChunk(payload: string): ParsedFrameLogChunk | null {
  const bar = payload.indexOf("|");
  if (bar <= 0) return null;
  const head = payload.slice(0, bar);

  if (head === "EOF") {
    const rest = payload.slice(bar + 1);
    const bar2 = rest.indexOf("|");
    if (bar2 > 0 && DAY_RE.test(rest.slice(0, bar2))) {
      const size = Number(rest.slice(bar2 + 1));
      return Number.isInteger(size) && size >= 0 ? { kind: "eof", day: rest.slice(0, bar2), size } : null;
    }
    const size = Number(rest);
    return Number.isInteger(size) && size >= 0 ? { kind: "eof", day: "", size } : null;
  }

  if (DAY_RE.test(head)) {
    const rest = payload.slice(bar + 1);
    const bar2 = rest.indexOf("|");
    if (bar2 <= 0) return null;
    const offset = Number(rest.slice(0, bar2));
    if (!Number.isInteger(offset) || offset < 0) return null;
    return { kind: "chunk", day: head, offset, data: rest.slice(bar2 + 1) };
  }

  const offset = Number(head);
  if (!Number.isInteger(offset) || offset < 0) return null;
  return { kind: "chunk", day: "", offset, data: payload.slice(bar + 1) };
}

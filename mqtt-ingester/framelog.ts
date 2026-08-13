// SD-path v1: raw frame-log bytes pulled from a device over MQTT.
//
// The server publishes {"act":"framelog","off":N,"n":k,"d":"<yymmdd>"} on the
// device's cmd topic; the device answers on device/sck/<token>/framelog with
// chunks of the raw day file, each "<yymmdd>|<byte-offset>|<bytes>", ending
// with "EOF|<yymmdd>|<filesize>". Offsets are exact raw-file positions, which
// makes the transfer resumable (ask again from where you stopped) and
// idempotent (chunks are immutable -- storing one twice changes nothing).
// Reassembly is string_agg over offsets, within a day.
//
// DAY-ROTATED ONLY. A second, untagged wire form once existed for the
// pre-rotation single-file namespace ("<off>|<bytes>" / "EOF|<size>"). It is
// retired: no unit in the fleet serves it. Supporting both is what made the
// format ambiguous -- once a legacy offset reached six digits it was
// shape-identical to a YYMMDD tag, so every legacy chunk from 100,000 to
// 999,999 was misread as a date and dropped (serve-mute, stalling two units at
// exactly 360 x 278 = 100,080). With one form the first field is always the
// day and there is nothing to disambiguate. Untagged payloads are rejected.
//
// Historical rows with day = '' predate this and stay queryable; nothing new
// is written into that namespace.
export type ParsedFrameLogChunk =
  | { kind: "chunk"; day: string; offset: number; data: string }
  | { kind: "eof"; day: string; size: number };

const UINT_RE = /^\d+$/;

// The device formats the tag from the RTC as "%02d%02d%02d", so the month and
// day are always in range. Anything else is not a frame-log payload.
function isDay(s: string): boolean {
  if (!/^\d{6}$/.test(s)) return false;
  const month = Number(s.slice(2, 4));
  const day = Number(s.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function parseFrameLogChunk(payload: string): ParsedFrameLogChunk | null {
  const bar = payload.indexOf("|");
  if (bar <= 0) return null;
  const head = payload.slice(0, bar);
  const rest = payload.slice(bar + 1);
  const bar2 = rest.indexOf("|");
  if (bar2 <= 0) return null;

  const tag = rest.slice(0, bar2);
  const tail = rest.slice(bar2 + 1);

  if (head === "EOF") {
    if (!isDay(tag) || !UINT_RE.test(tail)) return null;
    return { kind: "eof", day: tag, size: Number(tail) };
  }

  if (!isDay(head) || !UINT_RE.test(tag)) return null;
  return { kind: "chunk", day: head, offset: Number(tag), data: tail };
}

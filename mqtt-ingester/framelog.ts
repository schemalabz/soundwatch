// SD-path v1: raw FRAMELOG.CSV bytes pulled from a device over MQTT.
//
// The server publishes {"act":"framelog","off":N,"n":k} on the device's cmd
// topic; the device answers on device/sck/<token>/framelog with chunks of the
// raw file, each "<byte-offset>|<bytes>", ending with "EOF|<filesize>".
// Offsets are exact raw-file positions, which makes the transfer resumable
// (ask again from where you stopped) and idempotent (chunks are immutable —
// storing one twice changes nothing). Reassembly is string_agg over offsets.

export type ParsedFrameLogChunk =
  | { kind: "chunk"; offset: number; data: string }
  | { kind: "eof"; size: number };

export function parseFrameLogChunk(payload: string): ParsedFrameLogChunk | null {
  const bar = payload.indexOf("|");
  if (bar <= 0) return null;
  const head = payload.slice(0, bar);
  if (head === "EOF") {
    const size = Number(payload.slice(bar + 1));
    return Number.isInteger(size) && size >= 0 ? { kind: "eof", size } : null;
  }
  const offset = Number(head);
  if (!Number.isInteger(offset) || offset < 0) return null;
  return { kind: "chunk", offset, data: payload.slice(bar + 1) };
}

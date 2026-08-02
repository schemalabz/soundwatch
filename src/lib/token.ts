import { randomInt } from "crypto";

// The device token is simultaneously the MQTT client-id, the topic component and
// the ONLY credential (the firmware sends no username/password). The broker ACL
// confines a client to device/sck/%c/#, so a leaked token exposes exactly one
// device — but it also means a guessable token is a real problem.
//
// Length is capped by firmware: Config.h declares `char token[7]`, so 6 usable
// characters. Widening it is a firmware change and must happen before the freeze;
// this constant is the single place to update on this side when it does.
export const TOKEN_LENGTH = 6;

// Ambiguity is a field problem, not a theoretical one: tokens get printed on
// labels and read aloud over the phone. Excludes 0/O, 1/I/l.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateToken(length = TOKEN_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isValidToken(t: unknown): t is string {
  return typeof t === "string" && t.length === TOKEN_LENGTH && /^[a-z0-9]+$/.test(t);
}

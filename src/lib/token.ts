import { randomInt } from "crypto";

// The device token is simultaneously the MQTT client-id, the topic component and
// the ONLY credential (the firmware sends no username/password). The broker ACL
// confines a client to device/sck/%c/#, so a leaked token exposes exactly one
// device — but it also means a guessable token is a real problem.
//
// Width decided 2026-08-02: 16 chars. Firmware >= 9267e65 declares
// `char token[17]` on both SAM and ESP and the portal accepts 6-16, so 16-char
// minting is safe for every newly provisioned unit. Validation stays 6..16
// because the bench fleet keeps its legacy 6-char identities.
export const TOKEN_LENGTH = 16;
export const TOKEN_MIN_LENGTH = 6;

// Ambiguity is a field problem, not a theoretical one: tokens get printed on
// labels and read aloud over the phone. Excludes 0/O, 1/I/l.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateToken(length = TOKEN_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isValidToken(t: unknown): t is string {
  return (
    typeof t === "string" &&
    t.length >= TOKEN_MIN_LENGTH &&
    t.length <= TOKEN_LENGTH &&
    /^[a-z0-9]+$/.test(t)
  );
}

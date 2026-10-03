import { describe, expect, it } from "vitest";
import { parseBrokerLine } from "./events";

// Real lines from the production broker log (Sep 24 – Oct 3).
describe("parseBrokerLine", () => {
  it("reads a connect with its public IP", () => {
    expect(parseBrokerLine(
      "2026-09-29T08:58:29+0000: New client connected from 79.107.86.91:59838 as s3bv2d25f36942t6 (p4, c1, k120)."
    )).toEqual({
      at: new Date("2026-09-29T08:58:29Z"), kind: "connect", ip: "79.107.86.91", clientId: "s3bv2d25f36942t6",
    });
  });

  it("reads a disconnect and its reason", () => {
    expect(parseBrokerLine(
      "2026-09-29T14:57:42+0000: Client s3bv2d25f36942t6 [79.107.86.91:59838] disconnected: exceeded timeout."
    )).toEqual({
      at: new Date("2026-09-29T14:57:42Z"), kind: "disconnect", ip: "79.107.86.91",
      clientId: "s3bv2d25f36942t6", reason: "exceeded timeout",
    });
  });

  it("a disconnect with no reason is a clean one", () => {
    expect(parseBrokerLine("2026-10-01T05:21:32+0000: Client probe [::1:46264] disconnected.")?.reason).toBe("clean");
  });

  it("accepts mosquitto's default epoch timestamps", () => {
    expect(parseBrokerLine(
      "1790261444: New client connected from 178.59.21.226:65252 as 5hvdyx9a8gkxd4aa (p4, c1, k120)."
    )?.at).toEqual(new Date(1790261444 * 1000));
  });

  it("ignores everything else", () => {
    for (const line of [
      "2026-10-01T05:21:27+0000: mosquitto version 2.1.2 starting",
      "2026-10-01T05:21:51+0000: New connection from 77.49.135.103:62610 on port 1883.",
      "2026-10-02T05:45:50+0000: Protocol error from 66.228.62.150:52787: First packet not CONNECT (4F).",
      "2026-10-01T05:51:28+0000: Saving in-memory database to /mosquitto/data//mosquitto.db.",
      "",
    ]) expect(parseBrokerLine(line)).toBeNull();
  });
});

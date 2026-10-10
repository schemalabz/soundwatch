import { describe, expect, it } from "vitest";
import { isNewBoot, parseBrokerLine } from "./events";

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

describe("isNewBoot", () => {
  const t = (iso: string) => new Date(iso);
  it("the daily restart: new boot a day after the previous one", () => {
    // previous row 06:13:56 with uptime 86241 s; new row uptime 103 s at 06:14:57
    const bootAt = new Date(t("2026-09-29T03:14:57Z").getTime() - 103_000);
    expect(isNewBoot(bootAt, t("2026-09-29T03:13:56Z"), 86241, 103)).toBe(true);
  });

  it("a real restart followed by its own backlog upload (Δάφνη, Sep 29 11:58)", () => {
    // a backlog row arrived at 08:58:30 with the old uptime 20230; the restart row arrives 08:58:40 with uptime 64
    const bootAt = new Date(t("2026-09-29T08:58:40Z").getTime() - 64_000);
    expect(isNewBoot(bootAt, t("2026-09-29T08:58:30Z"), 20230, 64)).toBe(true);
  });

  it("two restarts five minutes apart (Γαλάτσι, Sep 28) are both restarts", () => {
    const bootAt = new Date(t("2026-09-28T08:26:44Z").getTime() - 40_000);
    expect(isNewBoot(bootAt, t("2026-09-28T08:26:20Z"), 290, 40)).toBe(true);
  });

  it("a row replayed after a 5-minute outage is the same boot", () => {
    // live row: uptime 20300 at 10:10:00. Replayed row recorded 10:05 (uptime 20000) arrives 10:10:05.
    const bootAt = new Date(t("2026-10-01T10:10:05Z").getTime() - 20000_000);
    expect(isNewBoot(bootAt, t("2026-10-01T10:10:00Z"), 20300, 20000)).toBe(false);
  });
});

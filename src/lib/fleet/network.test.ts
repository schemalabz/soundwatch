import { describe, expect, it } from "vitest";
import { isStaticIp, providerOf } from "./network";

// Real reverse-DNS names and RIPE network names from the fleet's broker log.
describe("providerOf / isStaticIp", () => {
  it.each([
    ["adsl-214.91.140.85.tellas.gr", "GR-NOVA-NETWORK", "Nova", false],
    ["194.219.185.99.dsl.dyn.forthnet.gr", "LLU-POOL-KLN", "Nova", false],
    ["static178059021226.dsl.hol.gr", "CYTA-HELLAS", "Cyta", true],
    ["ppp-94-67-158-254.home.otenet.gr", "OTENET", "Cosmote", false],
  ])("%s", (ptr, net, provider, fixed) => {
    expect(providerOf(ptr, net)).toBe(provider);
    expect(isStaticIp(ptr)).toBe(fixed);
  });

  it("falls back to the registry name, then to unknown", () => {
    expect(providerOf(null, "SOME-ISP")).toBe("SOME-ISP");
    expect(providerOf(null, null)).toBeNull();
    expect(isStaticIp(null)).toBeNull();
  });
});

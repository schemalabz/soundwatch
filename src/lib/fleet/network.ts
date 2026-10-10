// A public IP → who provides the store's internet, and whether its address is
// fixed. From the reverse-DNS name first (ISPs encode it there), the RIPE
// network name second. Greek ISPs as seen on the fleet, Sep–Oct 2026.

const PROVIDERS: { re: RegExp; name: string }[] = [
  { re: /tellas\.gr|GR-NOVA|forthnet\.gr|LLU-POOL-KLN/i, name: "Nova" },
  { re: /hol\.gr|CYTA/i, name: "Cyta" },
  { re: /otenet\.gr|OTENET|cosmote/i, name: "Cosmote" },
  { re: /vodafone|vf-gr/i, name: "Vodafone" },
  { re: /auth\.gr|AUTH-NET/i, name: "AUTH (university)" },
];

export function providerOf(ptr: string | null, network: string | null): string | null {
  const hay = `${ptr ?? ""} ${network ?? ""}`;
  for (const p of PROVIDERS) if (p.re.test(hay)) return p.name;
  return network ?? null;
}

/** true = fixed address, false = dynamic pool, null = cannot tell. */
export function isStaticIp(ptr: string | null): boolean | null {
  if (!ptr) return null;
  if (/static/i.test(ptr)) return true;
  if (/\bdyn\b|\.dyn\.|adsl-|ppp-|dsl\.dyn|pool/i.test(ptr)) return false;
  return null;
}

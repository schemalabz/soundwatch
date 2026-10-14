import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/strings/site";

// The public pages are for everyone; admin, the installer (its URL carries
// a device token), the per-sensor pages (share keys travel in the URL) and
// the raw API are not. Staging serves invented numbers: nothing of it is
// indexed at all.
export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "simulated") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/docs"],
      disallow: ["/admin", "/install", "/sensors/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

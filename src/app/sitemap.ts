import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/strings/site";

// The public pages. The summary and the timeline change by the minute.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/timeline`, changeFrequency: "always", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/status`, changeFrequency: "always", priority: 0.3 },
  ];
}

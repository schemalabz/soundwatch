import type { MetadataRoute } from "next";
import { siteStrings as tr } from "@/lib/strings/site";

// «Add to home screen»: the map, full screen, with the ring mark.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: tr.title,
    short_name: tr.manifest.shortName,
    description: tr.description,
    lang: "el",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

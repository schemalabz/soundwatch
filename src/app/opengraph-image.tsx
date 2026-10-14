import { ogCard, OG_SIZE } from "@/lib/server/ogCard";
import { siteStrings as tr } from "@/lib/strings/site";

// The share card for every page that has none of its own (/, /summary, …).
export const alt = tr.card.home.alt;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: tr.card.home.title, lead: tr.card.home.lead });
}

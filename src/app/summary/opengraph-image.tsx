import { ogCard, OG_SIZE } from "@/lib/server/ogCard";
import { siteStrings as tr } from "@/lib/strings/site";

// /summary's share card: the home card's headline, the summary's own lead.
export const alt = `${tr.summary.title} — ${tr.card.home.alt}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ label: tr.card.summaryLabel, title: tr.card.home.title, lead: tr.summary.description });
}

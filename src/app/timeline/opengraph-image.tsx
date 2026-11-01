import { ogCard, OG_SIZE } from "@/lib/server/ogCard";
import { siteStrings as tr } from "@/lib/strings/site";

// /timeline's share card: the home card's headline, the timeline's own lead.
export const alt = `${tr.timeline.title} — ${tr.card.home.alt}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ label: tr.card.timelineLabel, title: tr.card.home.title, lead: tr.timeline.description });
}

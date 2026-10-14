import { ogCard, OG_SIZE } from "@/lib/server/ogCard";
import { aboutStrings } from "@/lib/strings/about";
import { siteStrings as tr } from "@/lib/strings/site";

// /about's share card: the page's own headline and description.
export const alt = `${aboutStrings.hero.title} — soundwatch × skroutz`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ label: tr.card.aboutLabel, title: aboutStrings.hero.title, lead: aboutStrings.meta.description });
}

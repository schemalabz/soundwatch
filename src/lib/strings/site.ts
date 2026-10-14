// What the site says about itself to browsers, search engines and link
// previews: titles, the description, the share card's words. Greek, like
// every screen. No levels and no unit claims here: a preview is read without
// any of the caveats around it.

export const SITE_NAME = "soundwatch";

/** The public address. NEXT_PUBLIC_BASE_URL wins where deployment sets it with a scheme. */
export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL?.startsWith("http")
  ? process.env.NEXT_PUBLIC_BASE_URL
  : "https://soundwatch.gr";

/**
 * Open Graph and Twitter fields every page shares. A page that sets its own
 * openGraph or twitter object REPLACES its parent's (Next merges shallowly),
 * so pages spread these in rather than restating them.
 */
export const SHARED_OPEN_GRAPH = { type: "website", siteName: SITE_NAME, locale: "el_GR" } as const;
export const SHARED_TWITTER = { card: "summary_large_image" } as const;

/** A page's title as every tab shows it: «Σύνοψη · soundwatch». */
export function pageTitle(page: string): string {
  return `${page} · ${SITE_NAME}`;
}

export const siteStrings = {
  /** The home page's title, whole (no template). */
  title: `${SITE_NAME} · ο θόρυβος της Αθήνας, ζωντανά`,
  description:
    "Ο θόρυβος κάθε γειτονιάς της Αθήνας, ζωντανά: αισθητήρες σε Skroutz Points σε όλη την πόλη, ο χάρτης, η σύγκριση με το συνηθισμένο κάθε θέσης και ανοιχτά δεδομένα.",
  summary: {
    title: "Σύνοψη",
    description: "Κατάταξη, χάρτης και γραφήματα του θορύβου της Αθήνας, για όποια περίοδο, μέρες και ώρες διαλέξετε.",
  },
  status: { title: "Κατάσταση δικτύου" },
  sensor: { title: "Αισθητήρας" },
  install: { title: "Εγκατάσταση" },
  /** The share card (Open Graph image). */
  card: {
    home: {
      title: "Ο θόρυβος της Αθήνας, ζωντανά",
      lead: "Αισθητήρες σε Skroutz Points σε όλη την πόλη. Ο χάρτης, η σύγκριση με το συνηθισμένο κάθε γειτονιάς και ανοιχτά δεδομένα.",
      alt: "soundwatch × skroutz — ο θόρυβος της Αθήνας, ζωντανά, σε χάρτη με κύκλους",
    },
    aboutLabel: "Σχετικά",
    summaryLabel: "Σύνοψη",
  },
  manifest: { shortName: SITE_NAME },
} as const;

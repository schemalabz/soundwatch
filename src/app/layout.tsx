import type { Metadata, Viewport } from "next";
import { Commissioner } from "next/font/google";
import { SHARED_OPEN_GRAPH, SHARED_TWITTER, SITE_NAME, SITE_URL, siteStrings as tr } from "@/lib/strings/site";
import "./globals.css";

// Commissioner: a humanist grotesque with native Greek by Kostas Bartsokas —
// the interface is Greek, so the typeface must be too. One family,
// weight-varied; numbers that must align use tabular-nums.
const commissioner = Commissioner({
  subsets: ["latin", "greek"],
  variable: "--font-sans",
  display: "swap",
});

// Icons, the share card, the manifest, robots and the sitemap come from the
// file conventions beside this layout (icon.svg, favicon.ico, apple-icon.png,
// opengraph-image.tsx, manifest.ts, robots.ts, sitemap.ts). Pages set their
// own title (the template adds « · soundwatch») and canonical path.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: tr.title, template: `%s · ${SITE_NAME}` },
  description: tr.description,
  applicationName: SITE_NAME,
  openGraph: { ...SHARED_OPEN_GRAPH, title: tr.title, description: tr.description },
  twitter: { ...SHARED_TWITTER, title: tr.title, description: tr.description },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el" className={`${commissioner.variable} h-full antialiased`}>
      <body className="h-full flex flex-col">
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </body>
    </html>
  );
}

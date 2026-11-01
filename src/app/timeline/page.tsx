import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { pageTitle, SHARED_OPEN_GRAPH, SHARED_TWITTER, siteStrings as tr } from "@/lib/strings/site";

// The same dashboard, opened on Χρονογραμμή: the map, minute by minute.
// Moving between it and Σύνοψη happens inside the shell, between / and
// /timeline, without a page load (see DashboardShell).
export const metadata: Metadata = {
  title: tr.timeline.title,
  description: tr.timeline.description,
  alternates: { canonical: "/timeline" },
  openGraph: { ...SHARED_OPEN_GRAPH, url: "/timeline", title: pageTitle(tr.timeline.title), description: tr.timeline.description },
  twitter: { ...SHARED_TWITTER, title: pageTitle(tr.timeline.title), description: tr.timeline.description },
};

export default function TimelinePage() {
  return <DashboardShell initialView="map" />;
}

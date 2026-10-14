import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { pageTitle, SHARED_OPEN_GRAPH, SHARED_TWITTER, siteStrings as tr } from "@/lib/strings/site";

// The same dashboard, opened on Σύνοψη. Switching lenses inside it moves
// between / and /summary without a page load (see DashboardShell).
export const metadata: Metadata = {
  title: tr.summary.title,
  description: tr.summary.description,
  alternates: { canonical: "/summary" },
  openGraph: { ...SHARED_OPEN_GRAPH, url: "/summary", title: pageTitle(tr.summary.title), description: tr.summary.description },
  twitter: { ...SHARED_TWITTER, title: pageTitle(tr.summary.title), description: tr.summary.description },
};

export default function SummaryPage() {
  return <DashboardShell initialView="summary" />;
}

import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { SHARED_OPEN_GRAPH, siteStrings as tr } from "@/lib/strings/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...SHARED_OPEN_GRAPH, url: "/", title: tr.title, description: tr.description },
};

export default function DashboardPage() {
  return <DashboardShell />;
}

import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";

// The same dashboard, opened on Σύνοψη. Switching lenses inside it moves
// between / and /summary without a page load (see DashboardShell).
export const metadata: Metadata = { title: "Σύνοψη · soundwatch" };

export default function SummaryPage() {
  return <DashboardShell initialView="summary" />;
}

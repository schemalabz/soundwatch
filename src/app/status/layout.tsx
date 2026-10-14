import type { Metadata } from "next";
import { siteStrings as tr } from "@/lib/strings/site";

// The page itself is a client component; its metadata lives here.
export const metadata: Metadata = {
  title: tr.status.title,
  alternates: { canonical: "/status" },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}

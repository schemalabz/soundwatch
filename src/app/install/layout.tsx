import type { Metadata } from "next";
import { siteStrings as tr } from "@/lib/strings/site";

// The installer's URL carries the device token: never indexed, never followed.
export const metadata: Metadata = {
  title: tr.install.title,
  robots: { index: false, follow: false },
};

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return children;
}

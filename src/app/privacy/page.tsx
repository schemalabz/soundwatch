import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { privacyStrings as doc } from "@/lib/strings/legal";
import { pageTitle, SHARED_OPEN_GRAPH, SHARED_TWITTER } from "@/lib/strings/site";

export const metadata: Metadata = {
  title: doc.meta.title,
  description: doc.meta.description,
  alternates: { canonical: "/privacy" },
  openGraph: { ...SHARED_OPEN_GRAPH, url: "/privacy", title: pageTitle(doc.meta.title), description: doc.meta.description },
  twitter: { ...SHARED_TWITTER, title: pageTitle(doc.meta.title), description: doc.meta.description },
};

export default function PrivacyPage() {
  return <LegalPage doc={doc} current="privacy" />;
}

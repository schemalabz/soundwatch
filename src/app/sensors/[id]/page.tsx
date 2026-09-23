import type { Metadata } from "next";
import SensorLivePage from "@/components/sensor/SensorLivePage";
import { SHARE_KEY_PARAM } from "@/lib/api/schemas";

// One sensor, live. Public sensors need nothing; bench units open for an
// admin (token in localStorage, sent by the client) or for a share link
// (?k=...). The share key travels in the URL, so this page is never indexed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "soundwatch — αισθητήρας",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // The param is named once, in the schemas module the gate and the client
  // URL builder both import — not spelled "k" a fourth time here.
  const k = sp[SHARE_KEY_PARAM];
  const shareKey = typeof k === "string" && k.length > 0 ? k : null;
  return <SensorLivePage id={id} shareKey={shareKey} />;
}

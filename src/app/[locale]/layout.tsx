import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "./globals.css";

export const metadata: Metadata = {
  title: "soundwatch",
  description: "Noise sensor network",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "el" | "en")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

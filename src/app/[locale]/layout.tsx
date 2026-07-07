import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Jura } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jura = Jura({
  variable: "--font-jura",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Set the theme before first paint to avoid a flash of the wrong scheme.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('sw-theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export const metadata: Metadata = {
  title: "Soundwatch Athens",
  description: "Live noise monitoring map for Athens",
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
    <html
      lang={locale}
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${jura.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-background text-foreground">
        <Script id="sw-theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP}
        </Script>
        <NextIntlClientProvider messages={messages}>
          <Nav />
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto sw-scroll">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

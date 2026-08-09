import type { Metadata } from "next";
import { Commissioner } from "next/font/google";
import "./globals.css";

// Commissioner: a humanist grotesque with native Greek by Kostas Bartsokas —
// the interface is Greek, so the typeface must be too. One family,
// weight-varied; numbers that must align use tabular-nums.
const commissioner = Commissioner({
  subsets: ["latin", "greek"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "soundwatch",
  description: "Δίκτυο αισθητήρων θορύβου στην Αθήνα",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el" className={`${commissioner.variable} h-full antialiased`}>
      <body className="h-full flex flex-col">
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </body>
    </html>
  );
}

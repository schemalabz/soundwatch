"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Map" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/about", label: "About" },
  ];

  return (
    <nav className="bg-[#1c1917] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-[#fb923c] font-extrabold text-base">
          🔊 Soundwatch
        </Link>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              pathname === link.href
                ? "text-white font-medium"
                : "text-[#d6d3d1] hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <span className="text-[#a8a29e] text-xs">Athens, Greece</span>
    </nav>
  );
}

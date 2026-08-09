"use client";

import { Link } from "@/i18n/navigation";

export default function Nav() {
  return (
    <nav className="bg-[#1c1917] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-[#fb923c] font-extrabold text-base">
          🔊 Soundwatch
        </Link>
        <Link
          href="/admin"
          className="text-sm text-[#d6d3d1] hover:text-white transition-colors"
        >
          Admin
        </Link>
      </div>
      <span className="text-[#a8a29e] text-xs">Athens</span>
    </nav>
  );
}

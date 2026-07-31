"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import ThemeToggle from "@/components/ThemeToggle";

export default function Nav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/", label: t("map") },
    { href: "/leaderboard", label: t("leaderboard") },
    { href: "/about", label: t("about") },
  ];

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav className="relative shrink-0 border-b-[0.5px] border-hairline bg-bg px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
      <div className="flex items-center gap-5 sm:gap-7 min-w-0">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <LogoMark />
          <span className="font-light text-[20px] tracking-tight text-ink">
            Soundwatch
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="sw-chip"
              data-active={pathname === link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Desktop right controls */}
      <div className="hidden md:flex items-center gap-3 sm:gap-4 shrink-0">
        <span className="sw-eyebrow">{t("location")}</span>
        <ThemeToggle />
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="md:hidden flex items-center justify-center w-9 h-9 -mr-1 rounded-lg hover:bg-[var(--sw-chrome-bg)] transition-colors"
        aria-label={t("menu")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Burger open={open} />
      </button>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="md:hidden absolute left-0 right-0 top-full z-40 bg-bg border-b-[0.5px] border-hairline shadow-lg animate-slide-up">
          <div className="flex flex-col p-3 gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm transition-colors data-[active=true]:bg-[var(--sw-tab-bg)] data-[active=true]:text-white hover:bg-[var(--sw-chrome-bg)]"
                data-active={pathname === link.href}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center justify-between mt-2 pt-3 border-t-[0.5px] border-hairline">
              <span className="sw-eyebrow">{t("location")}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

/* Hamburger that morphs into a close (X). */
function Burger({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="text-ink">
      <line
        x1="3" y1={open ? "10" : "6"} x2="17" y2={open ? "10" : "6"}
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        style={{ transformOrigin: "center", transform: open ? "rotate(45deg)" : "none", transition: "transform .2s" }}
      />
      <line
        x1="3" y1="10" x2="17" y2="10"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        style={{ opacity: open ? 0 : 1, transition: "opacity .15s" }}
      />
      <line
        x1="3" y1={open ? "10" : "14"} x2="17" y2={open ? "10" : "14"}
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        style={{ transformOrigin: "center", transform: open ? "rotate(-45deg)" : "none", transition: "transform .2s" }}
      />
    </svg>
  );
}

/* Dotted-cluster logo motif, echoing the dot-grid map. */
function LogoMark() {
  const dots = [
    [4, 1],
    [2, 3],
    [4, 3],
    [6, 3],
    [1, 5],
    [3, 5],
    [5, 5],
    [7, 5],
    [2, 7],
    [4, 7],
    [6, 7],
    [4, 9],
  ];
  return (
    <svg width="22" height="22" viewBox="0 0 8 10" aria-hidden="true">
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.6" fill="currentColor" className="text-ink" />
      ))}
    </svg>
  );
}

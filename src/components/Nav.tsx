"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import ThemeToggle from "@/components/ThemeToggle";

export default function Nav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const links = [
    { href: "/", label: t("map") },
    { href: "/leaderboard", label: t("leaderboard") },
    { href: "/about", label: t("about") },
  ];

  return (
    <nav className="shrink-0 border-b-[0.5px] border-hairline bg-bg px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
      <div className="flex items-center gap-5 sm:gap-7 min-w-0">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <LogoMark />
          <span className="font-light text-[20px] tracking-tight text-ink">
            Soundwatch
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="sw-chip"
                data-active={active}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <span className="sw-eyebrow hidden md:inline">{t("location")}</span>
        <ThemeToggle />
      </div>
    </nav>
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

"use client";

import { useTheme, setTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const theme = useTheme();

  return (
    <div className="sw-chiptrack" role="group" aria-label="Theme">
      <button
        type="button"
        aria-label="Light theme"
        aria-pressed={theme === "light"}
        data-active={theme === "light"}
        className="sw-chip !px-2 !py-1.5"
        onClick={() => setTheme("light")}
      >
        <SunIcon />
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        aria-pressed={theme === "dark"}
        data-active={theme === "dark"}
        className="sw-chip !px-2 !py-1.5"
        onClick={() => setTheme("dark")}
      >
        <MoonIcon />
      </button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

"use client";

import { useMemo } from "react";
import { useTheme, type Theme } from "@/lib/theme";

export interface ThemeColors {
  ink: string;
  muted: string;
  hairline: string;
  panel: string;
  bg: string;
}

const FALLBACK: ThemeColors = {
  ink: "#f1f0ec",
  muted: "#8c8a85",
  hairline: "rgba(255,255,255,0.12)",
  panel: "#141416",
  bg: "#0c0c0d",
};

function read(theme: Theme): ThemeColors {
  if (typeof window === "undefined") return FALLBACK;
  // `theme` is read so the value recomputes on each theme flip; the actual
  // colors come from the resolved CSS variables on <html>.
  void theme;
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
  return {
    ink: get("--sw-ink", FALLBACK.ink),
    muted: get("--sw-muted", FALLBACK.muted),
    hairline: get("--sw-hairline", FALLBACK.hairline),
    panel: get("--sw-panel", FALLBACK.panel),
    bg: get("--sw-bg", FALLBACK.bg),
  };
}

/** Reads SoundWatch theme colors, re-reading them when the theme flips. */
export function useThemeColors(): ThemeColors {
  const theme = useTheme();
  return useMemo(() => read(theme), [theme]);
}

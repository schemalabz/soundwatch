"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

function subscribe(callback: () => void): () => void {
  const obs = new MutationObserver(callback);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
}

export function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function getServerTheme(): Theme {
  return "dark";
}

/** Subscribes to the active theme via the <html data-theme> attribute. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getServerTheme);
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("sw-theme", theme);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

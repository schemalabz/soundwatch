// Dev-only observability: render counters and internals exposed on window
// so performance sessions can measure the app instead of guessing. Every
// entry point no-ops in production builds.

/* eslint-disable @typescript-eslint/no-explicit-any */

const enabled = process.env.NODE_ENV !== "production" && typeof window !== "undefined";

/** Count a component render: window.__swRenders in the console. */
export function devRenderCount(name: string): void {
  if (!enabled) return;
  const w = window as any;
  (w.__swRenders ??= {})[name] = (w.__swRenders[name] ?? 0) + 1;
}

/** Expose a live internal (e.g. the FrameStore) as window.__sw<name>. */
export function devExpose(name: string, value: unknown): void {
  if (!enabled) return;
  (window as any)[`__sw${name}`] = value;
}

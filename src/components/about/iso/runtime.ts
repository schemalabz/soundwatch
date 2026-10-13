// The figure contract, after iso-glow's: a figure mounts into a fresh <svg>,
// draws its markup once, and animates by changing attributes inside api.loop.
// The loop only runs while the figure is on screen, on the figure's own clock
// (seconds of visible time), so nine figures do not burn a laptop and a figure
// scrolled back into view resumes where it was rather than jumping.

import type { Kernel, Pt3 } from "./kernel";
import { frame, slits, esc } from "./kernel";

export interface IsoApi {
  iso: { frame: typeof frame; slits: typeof slits; esc: typeof esc };
  /** fn(t, dt): t = seconds of visible time since mount, dt = seconds since last call. */
  loop: (fn: (t: number, dt: number) => void) => void;
  readout: (s: string) => void;
  /** Warm haze behind the figure while something is on. */
  power: (on: boolean) => void;
  /** prefers-reduced-motion: the loop runs once, at a representative moment. */
  reduced: boolean;
}

export interface IsoHandle {
  key?: (e: KeyboardEvent) => boolean;
  unmount?: () => void;
}

export interface IsoFig {
  mount: (stage: SVGSVGElement, api: IsoApi) => IsoHandle | void;
}

/** Move an element so its local origin sits at a world point. */
export function place(el: Element, K: Kernel, p: Pt3, origin: Pt3 = [0, 0, 0]) {
  const a = K.P(...p), b = K.P(...origin);
  el.setAttribute("transform", `translate(${(a[0] - b[0]).toFixed(2)} ${(a[1] - b[1]).toFixed(2)})`);
}

export const $ = <T extends Element = SVGElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
export const $$ = <T extends Element = SVGElement>(root: ParentNode, sel: string) => [...root.querySelectorAll(sel)] as T[];

// The iso-figure projection kernel (Tolga Cohce, MIT; via iso-glow), ported
// so the figures on /about are drawn the way the skill draws them:
// +x runs down-right, +y down-left, +z up. Everything here returns SVG
// markup strings or screen points; the figures decide what is lit.
//
// Additions over the skill's kernel, all built on the same projection:
// cylinders, discs in the FRONT plane (wheels), convex hulls of projected
// points (round solids), and point/segment helpers for animation.

export type Pt3 = [number, number, number];
export type Pt2 = [number, number];

const C = Math.cos(Math.PI / 6);
const S = Math.sin(Math.PI / 6);

const f2 = (n: number) => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(2));

/** Convex hull (monotone chain) of screen points, as a closed path. */
export function hull2(pts: Pt2[]): string {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return "";
  const cross = (o: Pt2, a: Pt2, b: Pt2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  const h = lo.slice(0, -1).concat(up.slice(0, -1));
  return "M" + h.map((q) => `${f2(q[0])} ${f2(q[1])}`).join("L") + "Z";
}

function kernel(OX: number, OY: number) {
  const P = (x: number, y: number, z: number): Pt2 => [(x - y) * C + OX, (x + y) * S - z + OY];
  const D = (x: number, y: number, z: number): Pt2 => [(x - y) * C, (x + y) * S - z];
  const plane = (O: Pt3, U: Pt3, V: Pt3) => {
    const o = P(...O), u = D(...U), v = D(...V);
    return `matrix(${f2(u[0])} ${f2(u[1])} ${f2(v[0])} ${f2(v[1])} ${f2(o[0])} ${f2(o[1])})`;
  };
  const TOP = (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);
  const FRONT = (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 0, -1]);
  const SIDE = (x: number, y: number, z: number) => plane([x, y, z], [0, -1, 0], [0, 0, -1]);
  const rect = (t: string, w: number, h: number, r = 0, cls = "face") =>
    `<g transform="${t}"><rect class="${cls}" width="${f2(w)}" height="${f2(h)}" rx="${r}"/></g>`;
  // Rounded box: one rounded top plus one continuous side wall along the
  // visible part of the outline, so the corners meet cleanly.
  const rounded = (x: number, y: number, z: number, w: number, d: number, h: number, r: number, cls: string) => {
    r = Math.min(r, w / 2, d / 2);
    const n = 10, z1 = z + h, q = Math.PI / 4, H = Math.PI / 2, c = cls ? " " + cls : "";
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      const o: Pt2[] = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return o;
    };
    const ring = [...arc(x + w - r, y + r, -H, 0), ...arc(x + w - r, y + d - r, 0, H), ...arc(x + r, y + d - r, H, 2 * H), ...arc(x + r, y + r, 2 * H, 3 * H)];
    const vis = [...arc(x + w - r, y + r, -q, 0), ...arc(x + w - r, y + d - r, 0, H), ...arc(x + r, y + d - r, H, 3 * q)];
    const d3 = (pts: Pt3[]) => "M" + pts.map((p) => P(...p).map(f2).join(" ")).join("L") + "Z";
    const wall: Pt3[] = [...vis.map(([a, b]) => [a, b, z] as Pt3), ...vis.slice().reverse().map(([a, b]) => [a, b, z1] as Pt3)];
    return `<path class="face${c}" d="${d3(wall)}"/><path class="face top${c}" d="${d3(ring.map(([a, b]) => [a, b, z1] as Pt3))}"/>`;
  };
  const box = (x: number, y: number, z: number, w: number, d: number, h: number, r = 0) =>
    r > 0
      ? rounded(x, y, z, w, d, h, r, "")
      : rect(SIDE(x + w, y + d, z + h), d, h) + rect(FRONT(x, y + d, z + h), w, h) + rect(TOP(x, y, z + h), w, d, 0, "face top");
  const boxc = (x: number, y: number, z: number, w: number, d: number, h: number, r: number, cls: string) =>
    r > 0
      ? rounded(x, y, z, w, d, h, r, cls)
      : rect(SIDE(x + w, y + d, z + h), d, h, 0, "face " + cls) + rect(FRONT(x, y + d, z + h), w, h, 0, "face " + cls) + rect(TOP(x, y, z + h), w, d, 0, "face top " + cls);
  const path = (pts: Pt3[]) => "M" + pts.map((p) => P(...p).map(f2).join(" ")).join("L");
  const pt = (x: number, y: number, z: number) => P(x, y, z).map(f2).join(" ");

  /** A vertical cylinder standing at (cx, cy) from z up h: wall + top. */
  const cyl = (cx: number, cy: number, z: number, r: number, h: number, cls = "") => {
    const a = r * Math.SQRT2 * C, b = r * Math.SQRT2 * S;
    const [X, Yb] = P(cx, cy, z);
    const Yt = Yb - h;
    const c = cls ? " " + cls : "";
    return (
      `<path class="face${c}" d="M${f2(X - a)} ${f2(Yt)}L${f2(X - a)} ${f2(Yb)}A${f2(a)} ${f2(b)} 0 0 0 ${f2(X + a)} ${f2(Yb)}L${f2(X + a)} ${f2(Yt)}Z"/>` +
      `<ellipse class="face top${c}" cx="${f2(X)}" cy="${f2(Yt)}" rx="${f2(a)}" ry="${f2(b)}"/>`
    );
  };

  /** Points of a circle in the FRONT plane (x–z), centred at (cx, y, cz). */
  const ringF = (cx: number, y: number, cz: number, r: number, n = 40): Pt3[] => {
    const o: Pt3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
    }
    return o;
  };
  /** Points of a circle in the TOP plane (x–y) at height z. */
  const ringT = (cx: number, cy: number, z: number, r: number, n = 40): Pt3[] => {
    const o: Pt3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
    return o;
  };
  /** Convex hull of projected 3D points: the silhouette of a round solid. */
  const hull = (pts: Pt3[]) => hull2(pts.map((p) => P(...p)));

  return { P, D, plane, TOP, FRONT, SIDE, rect, box, boxc, path, pt, cyl, ringF, ringT, hull };
}

export type Kernel = ReturnType<typeof kernel> & { viewBox: string; W: number; H: number; OX: number; OY: number };

/** Frame a scene: pass its extreme 3D corners. Returns kernel + viewBox padded to ~4:3. */
export function frame(points: Pt3[], margin = 0.09, aspect = 4 / 3): Kernel {
  const d = points.map(([x, y, z]) => [(x - y) * C, (x + y) * S - z]);
  const x0 = Math.min(...d.map((p) => p[0])), x1 = Math.max(...d.map((p) => p[0]));
  const y0 = Math.min(...d.map((p) => p[1])), y1 = Math.max(...d.map((p) => p[1]));
  const m = margin * Math.max(x1 - x0, y1 - y0);
  let w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
  let ox = m - x0, oy = m - y0;
  if (w / h < aspect) {
    const nw = h * aspect;
    ox += (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / aspect;
    oy += (nh - h) / 2;
    h = nh;
  }
  return { ...kernel(ox, oy), viewBox: `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`, W: w, H: h, OX: ox, OY: oy };
}

/** Repeated hairlines in a face-local group: at a0, a0+step … a1, each spanning b0→b1. */
export function slits(a0: number, a1: number, step: number, b0: number, b1: number, vertical = true, cls = "detail"): string {
  let s = "";
  for (let a = a0; a <= a1 + 1e-6; a += step)
    s += vertical
      ? `<line class="${cls}" x1="${f2(a)}" y1="${b0}" x2="${f2(a)}" y2="${b1}"/>`
      : `<line class="${cls}" x1="${b0}" y1="${f2(a)}" x2="${b1}" y2="${f2(a)}"/>`;
  return s;
}

export const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Position along a 3D polyline at t ∈ [0, 1], by arc length. */
export function along(pts: Pt3[], t: number): Pt3 {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    seg.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, d / seg[i]) : 0;
      const a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Deterministic pseudo-random sequence, so every reader sees the same drawing. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** "{n} καρέ" → "12 καρέ". Templates live in the strings table so the copy doc carries them. */
export function fmt(t: string, v: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
}

/** Greek number formatting: 1.234 and 63,4. */
export const num = (n: number, d = 0) =>
  n.toLocaleString("el-GR", { minimumFractionDigits: d, maximumFractionDigits: d });

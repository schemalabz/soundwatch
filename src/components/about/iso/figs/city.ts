// Fig 9 · Στον χάρτη. A small grid of city blocks with a square in the
// middle; sensors stand on the streets and their rings swell and shrink
// through a day that runs in 24 seconds. Each street has its own rhythm:
// the arterial peaks at rush hour, the nightlife street after midnight, the
// shopping street at midday, the residential ones stay low at night. Windows
// light up in the evening. Click a ring to read that sensor.

import { aboutStrings } from "@/lib/strings/about";
import { fmt, num, rng, clamp } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.map;

const PZ = 8, SIZE = 292;
const STREETS = [[88, 116], [180, 208]]; // both axes
const BLOCKS = [[6, 88], [116, 180], [208, 286]];
type Arche = "res" | "night" | "shop" | "arterial";
const SENSORS: { x: number; y: number; kind: Arche }[] = [
  { x: 102, y: 44, kind: "res" }, // Κυψέλη
  { x: 150, y: 102, kind: "night" }, // Εξάρχεια
  { x: 244, y: 194, kind: "res" }, // Παγκράτι
  { x: 194, y: 150, kind: "shop" }, // Κολωνάκι
  { x: 44, y: 194, kind: "night" }, // Πετράλωνα
  { x: 102, y: 102, kind: "arterial" }, // Ομόνοια
];
const DAY = 24; // seconds per day
const H0 = 18.5; // the figure opens in the early evening

// level by hour, per kind of street (device-dB, invented but shaped like the simulator's)
const g = (h: number, mu: number, sd: number) => {
  const d = Math.min(Math.abs(h - mu), 24 - Math.abs(h - mu));
  return Math.exp(-(d * d) / (2 * sd * sd));
};
const LEVEL: Record<Arche, (h: number) => number> = {
  res: (h) => 46 + 9 * g(h, 8.5, 2.2) + 8 * g(h, 19, 2.8) + 4 * g(h, 13, 3),
  night: (h) => 49 + 20 * g(h, 0.5, 2.6) + 5 * g(h, 14, 3),
  shop: (h) => 47 + 17 * g(h, 13.5, 3.4),
  arterial: (h) => 53 + 15 * g(h, 8.5, 1.8) + 13 * g(h, 18.5, 2.2) + 8 * g(h, 13, 4),
};
// how many windows are lit, by hour
const night = (h: number) => clamp(g(h, 21.5, 2.6) * 1.1 + g(h, 6.8, 0.8) * 0.4 + (h >= 23 || h < 1 ? 0.35 : 0));

export const city: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [SIZE, 0, 0], [0, SIZE, 0], [SIZE, SIZE, 0], [140, 20, 70], [20, 140, 90], [0, SIZE + 70, 120]], 0.04);
    const { P, TOP, FRONT, SIDE, box, cyl, pt } = K;
    const esc = api.iso.esc;
    const r = rng(7);
    let s = "";

    // ---------- ground: blocks, streets, crossings ----------
    s += box(0, 0, 0, SIZE, SIZE, PZ, 12);
    let ground = "";
    for (const [a, b] of STREETS) {
      ground += `<rect class="face recess" x="0" y="${a}" width="${SIZE}" height="${b - a}"/><rect class="face recess" x="${a}" y="0" width="${b - a}" height="${SIZE}"/>`;
    }
    for (const [a, b] of STREETS) {
      const m = (a + b) / 2;
      for (let x = 4; x < SIZE; x += 14) if (!STREETS.some(([c, d]) => x + 7 > c && x < d)) ground += `<line class="lane" x1="${x}" y1="${m}" x2="${x + 7}" y2="${m}"/><line class="lane" x1="${m}" y1="${x}" x2="${m}" y2="${x + 7}"/>`;
    }
    s += `<g transform="${TOP(0, 0, PZ)}">${ground}</g>`;

    // ---------- sensor rings on the ground (under the buildings) ----------
    s += `<g transform="${TOP(0, 0, PZ + 0.2)}">`;
    SENSORS.forEach((p, i) => {
      s += `<circle class="halo hot cty-disc" cx="${p.x}" cy="${p.y}" r="10"/>`;
      s += `<circle class="ring cty-ring" cx="${p.x}" cy="${p.y}" r="10"/>`;
      s += `<circle class="hit" data-hit="${i}" cx="${p.x}" cy="${p.y}" r="20"/>`;
    });
    s += `</g>`;

    // ---------- the square: paving, trees, a fountain ----------
    const [px0, px1] = BLOCKS[1];
    let plaza = `<rect class="face top" x="${px0 + 4}" y="${px0 + 4}" width="${px1 - px0 - 8}" height="${px1 - px0 - 8}" rx="4"/>`;
    for (let k = px0 + 12; k < px1 - 6; k += 8) plaza += `<line class="detail" x1="${k}" y1="${px0 + 6}" x2="${k}" y2="${px1 - 6}"/><line class="detail" x1="${px0 + 6}" y1="${k}" x2="${px1 - 6}" y2="${k}"/>`;
    s += `<g transform="${TOP(0, 0, PZ)}">${plaza}</g>`;
    const mid = (px0 + px1) / 2;
    s += cyl(mid, mid, PZ, 14, 3) + cyl(mid, mid, PZ + 3, 3, 8);

    // ---------- buildings: lots per block, back to front ----------
    type B = { x: number; y: number; w: number; d: number; h: number };
    const bs: B[] = [];
    for (let bi = 0; bi < 3; bi++)
      for (let bj = 0; bj < 3; bj++) {
        if (bi === 1 && bj === 1) continue;
        const [x0, x1] = BLOCKS[bi], [y0, y1] = BLOCKS[bj];
        const splitX = r() < 0.6, m = 6;
        const cut = x0 + (x1 - x0) * (0.42 + r() * 0.16), cutY = y0 + (y1 - y0) * (0.42 + r() * 0.16);
        const lots: [number, number, number, number][] = splitX
          ? [[x0 + m, y0 + m, cut - 2, y1 - m], [cut + 2, y0 + m, x1 - m, cutY - 2], [cut + 2, cutY + 2, x1 - m, y1 - m]]
          : [[x0 + m, y0 + m, cut - 2, cutY - 2], [cut + 2, y0 + m, x1 - m, cutY - 2], [x0 + m, cutY + 2, x1 - m, y1 - m]];
        for (const [a, b, c, d] of lots) bs.push({ x: a, y: b, w: c - a, d: d - b, h: [14, 18, 22, 28, 34][Math.floor(r() * 5)] });
      }
    // trees on the square, sorted in with the buildings
    const trees: [number, number][] = [[px0 + 14, px0 + 14], [px1 - 14, px0 + 14], [px0 + 14, px1 - 14], [px1 - 14, px1 - 14]];
    const items: [number, () => string][] = [
      ...bs.map((b) => [b.x + b.y + b.w + b.d, () => building(b)] as [number, () => string]),
      ...trees.map(([x, y]) => [x + y, () => tree(x, y)] as [number, () => string]),
    ];
    items.sort((a, b) => a[0] - b[0]).forEach(([, f]) => (s += f()));

    // ---------- the signal: pulses drawn over the buildings so no street hides them ----------
    s += `<g transform="${TOP(0, 0, PZ + 0.2)}">${SENSORS.map((p) => `<circle class="ring cty-pulse" cx="${p.x}" cy="${p.y}" r="10" opacity="0"/>`).join("")}</g>`;

    // ---------- sensor posts (over the buildings' feet, under the labels) ----------
    SENSORS.forEach((p) => {
      s += cyl(p.x, p.y, PZ, 1.2, 9);
      const q = P(p.x, p.y, PZ + 10);
      s += `<circle class="led hot cty-led" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="1.8" filter="url(#iso-soft)"/>`;
    });

    // ---------- clock and the selected sensor's card ----------
    const hx = K.W * 0.04, hy = K.H * 0.07;
    s += `<g>
      <text class="cap" x="${hx}" y="${hy}">${esc(T.clock)}</text>
      <text id="cty-time" class="scr" x="${hx}" y="${hy + 17}" font-size="16" font-weight="700">00:00</text>
      <line class="detail" x1="${hx}" y1="${hy + 26}" x2="${hx + 96}" y2="${hy + 26}" style="stroke:var(--line)"/>
      ${[0, 6, 12, 18, 24].map((hh) => `<line class="detail" x1="${hx + hh * 4}" y1="${hy + 24}" x2="${hx + hh * 4}" y2="${hy + 28}"/><text class="label" x="${hx + hh * 4}" y="${hy + 35}" font-size="5" text-anchor="middle">${String(hh).padStart(2, "0")}</text>`).join("")}
      <circle id="cty-mark" class="led hot" cx="${hx}" cy="${hy + 26}" r="2.2"/>
    </g>`;
    s += `<g id="cty-card"><path class="leader" d=""/><rect class="plate" x="0" y="0" width="86" height="22" rx="4"/><text class="cap hi" x="6" y="9.5"></text><text class="scr" x="6" y="18.5" font-size="8"></text></g>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    function building(b: B) {
      let o = box(b.x, b.y, PZ, b.w, b.d, b.h, 0);
      const win = (w: number, h: number) => {
        let q = "";
        for (let v = 5; v + 4 <= h - 3; v += 8)
          for (let u = 4; u + 3.4 <= w - 3; u += 7) q += `<rect class="win" data-th="${r().toFixed(3)}" x="${u}" y="${v}" width="3.4" height="4.2"/>`;
        return q;
      };
      o += `<g transform="${FRONT(b.x, b.y + b.d, PZ + b.h)}">${win(b.w, b.h)}</g>`;
      o += `<g transform="${SIDE(b.x + b.w, b.y + b.d, PZ + b.h)}">${win(b.d, b.h)}</g>`;
      o += `<g transform="${TOP(b.x, b.y, PZ + b.h)}"><rect class="detail" x="2" y="2" width="${b.w - 4}" height="${b.d - 4}"/></g>`;
      if (b.w > 24 && b.d > 24 && r() < 0.6) o += cyl(b.x + b.w * 0.3, b.y + b.d * 0.35, PZ + b.h, 3.5, 6);
      return o;
    }
    function tree(x: number, y: number) {
      const c = P(x, y, PZ + 18);
      return `<path class="mast" d="M${pt(x, y, PZ)}L${pt(x, y, PZ + 13)}"/>` + [[-4, 1, 5], [4, 1, 5.5], [0, -4, 6], [0, 4, 4.5]].map(([dx, dy, rr]) => `<circle class="face" cx="${(c[0] + dx).toFixed(1)}" cy="${(c[1] + dy).toFixed(1)}" r="${rr}"/>`).join("");
    }

    // ---------- live ----------
    const discs = $$(stage, ".cty-disc"), rings = $$(stage, ".cty-ring"), pulses = $$(stage, ".cty-pulse");
    const wins = $$(stage, ".win").map((el) => ({ el, th: Number(el.getAttribute("data-th")), on: false }));
    const time = $(stage, "#cty-time"), mark = $(stage, "#cty-mark"), card = $(stage, "#cty-card");
    const cardLeader = card.querySelector("path")!, cardRect = card.querySelector("rect")!;
    const [cardName, cardVal] = [...card.querySelectorAll("text")];
    const st = { sel: 3 };
    const onClick = (e: MouseEvent) => {
      const h = (e.target as Element).closest("[data-hit]");
      st.sel = h ? Number(h.getAttribute("data-hit")) : (st.sel + 1) % SENSORS.length;
    };
    stage.addEventListener("click", onClick);

    api.loop((t) => {
      const hour = (H0 + (t / DAY) * 24) % 24;
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60 / 10) * 10;
      const clock = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      time.textContent = clock;
      mark.setAttribute("cx", (hx + hour * 4).toFixed(1));

      SENSORS.forEach((p, i) => {
        const lv = LEVEL[p.kind](hour);
        // the dashboard's law: radius doubles every 6 dB (10^(Δ/20)), clamped to the streets
        const rad = Math.min(30, Math.max(3.5, 8 * Math.pow(10, (lv - 55) / 20)));
        discs[i].setAttribute("r", rad.toFixed(1));
        discs[i].setAttribute("opacity", (0.12 + (lv - 44) / 70).toFixed(2));
        rings[i].setAttribute("r", rad.toFixed(1));
        rings[i].setAttribute("stroke-width", i === st.sel ? "2.4" : "1.2");
        const f = (t * 0.7 + i * 0.37) % 1;
        pulses[i].setAttribute("r", (rad + f * 14).toFixed(1));
        pulses[i].setAttribute("opacity", ((1 - f) * 0.7).toFixed(2));
        if (i === st.sel) {
          const top = P(p.x, p.y, PZ + 12), at: [number, number] = [top[0] + 14, top[1] - 34];
          card.setAttribute("transform", `translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`);
          cardLeader.setAttribute("d", `M${(top[0] - at[0]).toFixed(1)} ${(top[1] - at[1]).toFixed(1)}L0 22`);
          cardName.textContent = T.sensors[i];
          cardVal.textContent = num(lv, 1);
          cardRect.setAttribute("width", String(Math.max(60, T.sensors[i].length * 6.4 + 14)));
          api.readout(fmt(T.readout, { time: clock, name: T.sensors[i], value: num(lv, 1) }));
        }
      });
      const n = night(hour);
      for (const w of wins) {
        const on = w.th < n * 0.85;
        if (on !== w.on) {
          w.on = on;
          w.el.classList.toggle("on", on);
        }
      }
      api.power(true);
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? ((st.sel = (st.sel + 1) % SENSORS.length), true) : false),
      unmount: () => stage.removeEventListener("click", onClick),
    };
  },
};



// Fig 8 · Ο διακομιστής κάνει τα μαθηματικά. A rack takes in each line, the
// database stores it, and the display turns the integers into a level: the
// Μέση for the newest interval, its L10/L50/L90, and the last few minutes as
// a line. A new interval arrives every second or so; click for a loud one.

import { aboutStrings } from "@/lib/strings/about";
import { fmt, num, rng, type Pt3 } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.server;

const PZ = 8;
const RACK = { x: 24, y: 32, w: 66, d: 58, h: 136 };
const DBC = { x: 150, y: 142, r: 22 };
const SCR = { x: 168, y: 40, w: 160, d: 6, z: PZ + 46, h: 100 };
const N = 30;
const CYCLE = 1.5;

export const server: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [360, 0, 0], [0, 260, 0], [360, 220, 0], [RACK.x, RACK.y, PZ + RACK.h], [SCR.x, SCR.y, SCR.z + SCR.h], [SCR.x + SCR.w, SCR.y, SCR.z + SCR.h]], 0.05);
    const { P, TOP, FRONT, SIDE, box, cyl, path } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    s += box(0, 0, 0, 360, 220, PZ, 12);
    s += `<g transform="${TOP(0, 0, PZ)}"><rect class="detail" x="8" y="8" width="344" height="204" rx="6" opacity=".5"/>${slits(20, 340, 20, 8, 212, true)}</g>`;

    // ---------- wires on the floor ----------
    const W1: Pt3[] = [[RACK.x + RACK.w, RACK.y + 40, PZ], [DBC.x, RACK.y + 40, PZ], [DBC.x, DBC.y - DBC.r, PZ]];
    const W2: Pt3[] = [[DBC.x + DBC.r, DBC.y, PZ], [SCR.x + SCR.w / 2 + 3, DBC.y, PZ], [SCR.x + SCR.w / 2 + 3, SCR.y + 14, PZ]];
    s += `<path id="sv-w1" class="wire" d="${path(W1)}"/><path id="sv-p1" class="pulse" pathLength="1000" d="${path(W1)}"/>`;
    s += `<path id="sv-w2" class="wire" d="${path(W2)}"/><path id="sv-p2" class="pulse" pathLength="1000" d="${path(W2)}"/>`;

    // ---------- the display, on a post ----------
    s += box(SCR.x + SCR.w / 2 - 3, SCR.y + 8, PZ, 6, 6, SCR.z - PZ, 1);
    s += box(SCR.x + SCR.w / 2 - 20, SCR.y + 2, PZ, 40, 18, 3, 2);
    s += box(SCR.x, SCR.y, SCR.z, SCR.w, SCR.d, SCR.h, 3);
    const CX0 = 10, CX1 = SCR.w - 10, CY0 = 52, CY1 = SCR.h - 10;
    s += `<g transform="${FRONT(SCR.x, SCR.y + SCR.d, SCR.z + SCR.h)}">
      <rect class="glass hot" x="5" y="5" width="${SCR.w - 10}" height="${SCR.h - 10}" rx="3"/>
      <text class="label" x="11" y="15" font-size="5.4">${esc(T.laeq)}</text>
      <text id="sv-val" class="scr" x="11" y="35" font-size="18" font-weight="700">0</text>
      <text id="sv-stats" class="label" x="11" y="45" font-size="5"></text>
      ${slits(CY0, CY1, 10, CX0, CX1, false)}
      <path id="sv-line" class="curve hot" d=""/>
      <circle id="sv-dot" class="led hot" r="2.4"/>
    </g>`;

    // ---------- the rack ----------
    s += box(RACK.x, RACK.y, PZ, RACK.w, RACK.d, RACK.h, 3);
    let units = "";
    for (let k = 0; k < 8; k++) {
      const v = 6 + k * 16;
      units += `<rect class="face recess" x="4" y="${v}" width="${RACK.w - 8}" height="13" rx="1"/>${slits(26, RACK.w - 8, 3, v + 3, v + 10)}`;
      units += `<circle class="led sv-led" cx="9" cy="${v + 4.5}" r="1.4"/><circle class="led sv-led" cx="15" cy="${v + 4.5}" r="1.4"/><rect class="detail" x="7" y="${v + 8}" width="12" height="2.4"/>`;
    }
    s += `<g transform="${FRONT(RACK.x, RACK.y + RACK.d, PZ + RACK.h)}">${units}</g>`;
    s += `<g transform="${SIDE(RACK.x + RACK.w, RACK.y + RACK.d, PZ + RACK.h)}">${slits(6, RACK.d - 6, 3, 8, RACK.h - 8)}</g>`;
    s += `<g transform="${TOP(RACK.x, RACK.y, PZ + RACK.h)}"><rect class="detail" x="4" y="4" width="${RACK.w - 8}" height="${RACK.d - 8}"/>${slits(12, RACK.w - 12, 6, 12, RACK.d - 12)}</g>`;

    // ---------- the database: three platters ----------
    for (let k = 0; k < 3; k++) s += cyl(DBC.x, DBC.y, PZ + k * 19, DBC.r, 15);
    const top = P(DBC.x, DBC.y, PZ + 2 * 19 + 15);
    s += `<ellipse id="sv-dbglow" class="halo" cx="${top[0].toFixed(1)}" cy="${top[1].toFixed(1)}" rx="${(DBC.r * 1.3).toFixed(1)}" ry="${(DBC.r * 0.72).toFixed(1)}" filter="url(#iso-bloom)"/>`;
    s += `<g id="sv-bands">${[0, 1, 2].map((k) => {
      const b = P(DBC.x, DBC.y, PZ + k * 19 + 7.5);
      return `<path class="wire" d="M${(b[0] - DBC.r * 1.2247).toFixed(1)} ${b[1].toFixed(1)}A${(DBC.r * 1.2247).toFixed(1)} ${(DBC.r * 0.7071).toFixed(1)} 0 0 0 ${(b[0] + DBC.r * 1.2247).toFixed(1)} ${b[1].toFixed(1)}"/>`;
    }).join("")}</g>`;
    // labels, flat over the scene
    const dbl = P(DBC.x - DBC.r, DBC.y, PZ + 30), dbt: [number, number] = [dbl[0] - 26, dbl[1] + 30];
    s += `<path class="leader" d="M${dbl[0].toFixed(1)} ${dbl[1].toFixed(1)}L${dbt[0].toFixed(1)} ${dbt[1].toFixed(1)}h-6"/><text class="cap" x="${(dbt[0] - 9).toFixed(1)}" y="${(dbt[1] + 2.5).toFixed(1)}" text-anchor="end">${esc(T.db)}</text>`;
    const fm = P(SCR.x + SCR.w / 2 - 22, DBC.y, PZ), fmt2: [number, number] = [fm[0] + 4, fm[1] + 26];
    s += `<path class="leader" d="M${fm[0].toFixed(1)} ${fm[1].toFixed(1)}L${fmt2[0].toFixed(1)} ${fmt2[1].toFixed(1)}h6"/><text class="tag" x="${(fmt2[0] + 9).toFixed(1)}" y="${(fmt2[1] + 2.5).toFixed(1)}" style="font-size:8px">${esc(T.formula)}</text>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- live ----------
    const leds = $$(stage, ".sv-led"), p1 = $(stage, "#sv-p1"), p2 = $(stage, "#sv-p2"), w1 = $(stage, "#sv-w1"), w2 = $(stage, "#sv-w2");
    const glow = $(stage, "#sv-dbglow"), bands = $$(stage, "#sv-bands path");
    const val = $(stage, "#sv-val"), stats = $(stage, "#sv-stats"), line = $(stage, "#sv-line"), dot = $(stage, "#sv-dot");
    const r = rng(53);
    let level = 61;
    // a quiet interval: LAeq sits above the median, L10 above both, L90 is the
    // background. A loud event in the interval (a horn, a bus) lifts LAeq and
    // L10 a lot, the median a little, and leaves the background where it was.
    const next = (loud = false) => {
      level += (r() - 0.5) * 2.4 + (61 - level) * 0.08;
      const base = { laeq: level, l10: level + 3 + r() * 1.5, l50: level - 1 - r(), l90: level - 5 - r() * 1.5 };
      if (!loud) return base;
      const k = 10 + r() * 3;
      return { laeq: base.laeq + k, l10: base.l10 + k + 3, l50: base.l50 + 2 + r(), l90: base.l90 + 0.4 * r() };
    };
    const series = Array.from({ length: N }, () => next());
    const st = { t0: 0, loud: false, appended: true };
    const replay = (el: Element) => {
      el.classList.remove("go");
      void (el as SVGGraphicsElement).getBoundingClientRect();
      el.classList.add("go");
    };
    const onClick = () => void (st.loud = true);
    stage.addEventListener("click", onClick);
    const draw = () => {
      const lo = 46, hi = 82;
      const y = (v: number) => CY1 - ((v - lo) / (hi - lo)) * (CY1 - CY0);
      let d = "";
      series.forEach((p, i) => (d += (i ? "L" : "M") + (CX0 + (i / (N - 1)) * (CX1 - CX0)).toFixed(1) + " " + y(p.laeq).toFixed(1)));
      line.setAttribute("d", d);
      const last = series[N - 1];
      dot.setAttribute("cx", CX1.toFixed(1));
      dot.setAttribute("cy", y(last.laeq).toFixed(1));
      val.textContent = num(last.laeq, 1);
      stats.textContent = fmt(T.stats, { l10: num(last.l10, 1), l50: num(last.l50, 1), l90: num(last.l90, 1) });
      api.readout(fmt(T.readout, { laeq: num(last.laeq, 1), l10: num(last.l10, 1), l90: num(last.l90, 1) }));
    };
    draw();

    api.loop((t) => {
      const e = t - st.t0;
      if (e > CYCLE) {
        st.t0 = t;
        st.appended = false;
        replay(p1);
        leds.forEach((l) => l.classList.toggle("hot", r() < 0.45));
      }
      w1.classList.toggle("hot", e < 0.6);
      const inDb = e > 0.45 && e < 0.9;
      glow.classList.toggle("hot", inDb);
      bands.forEach((b, k) => b.classList.toggle("hot", inDb && e > 0.45 + k * 0.1));
      if (e > 0.6 && e < 0.62 + 1 / 60) replay(p2);
      w2.classList.toggle("hot", e > 0.6 && e < 1.15);
      if (!st.appended && e > 1.05) {
        st.appended = true;
        series.shift();
        series.push(next(st.loud));
        st.loud = false;
        draw();
      }
      dot.setAttribute("r", (2.4 + Math.max(0, 1 - Math.abs(e - 1.1) * 4) * 2).toFixed(2));
      api.power(true);
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (onClick(), true) : false),
      unmount: () => stage.removeEventListener("click", onClick),
    };
  },
};

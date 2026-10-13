// Fig 5 · Όπως ακούει το αυτί. What the firmware does, in order: each of the
// FFT's frequency bins is weighted by the A-curve, then all of them are added
// up — as energy — into the one number the frame contributes. The bins here
// are 48 of the FFT's 256, spaced so the bass is not crushed into one corner;
// their raw shape is a motorbike's, heavy in the bass, which is exactly where
// the curve takes most away. The 21 bands the sensor also sends are a separate
// path and stay unweighted; the figure says so.

import { aboutStrings } from "@/lib/strings/about";
import { ease, clamp, fmt, num } from "../kernel";
import { $, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.aweight;

const PZ = 8;
const NB = 48;
const FREQ = Array.from({ length: NB }, (_, i) => 90 * Math.pow(20000 / 90, i / (NB - 1)));
// IEC 61672 A-weighting, dB
const aWeight = (f: number) => {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return 20 * Math.log10(ra) + 2.0;
};
const AW = FREQ.map(aWeight);
// a motorbike passing: strongest around 100–200 Hz, falling ~5 dB per octave above
const RAW = FREQ.map((f) => 66 - 5.2 * Math.max(0, Math.log2(f / 140)) - 3 * Math.max(0, Math.log2(120 / f)));
const FLOOR = 18; // the plate's zero, in dB
const BX0 = 24, BS = 4.7, BW = 3.4, BY = 62, BD = 9;
const SUM = { x: 272, y: 56, w: 22, d: 20 };
const energy = (ls: number[]) => 10 * Math.log10(ls.reduce((a, l) => a + Math.pow(10, l / 10), 0));
const L_RAW = energy(RAW);

export const aweight: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [320, 0, 0], [0, 170, 0], [320, 170, 0], [14, 30, 112], [250, 30, 112], [SUM.x, SUM.y, 120]], 0.05);
    const { P, TOP, FRONT, box, path } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    s += box(0, 0, 0, 320, 170, PZ, 10);
    s += `<g transform="${TOP(0, 0, PZ)}"><rect class="detail" x="6" y="6" width="308" height="158" rx="6" opacity=".5"/></g>`;

    // ---------- the panel with the A-curve ----------
    const PW = 244, PH = 100, PX = 12, PYp = 30;
    s += box(PX + 10, PYp - 6, PZ, PW - 20, 16, 3, 2);
    s += box(PX, PYp, PZ + 3, PW, 5, PH, 3);
    const u = (i: number) => BX0 + i * BS + BW / 2 - PX; // a bin's position on the panel
    const v = (db: number) => 30 - db * 2.2; // 0 dB at v = 30
    let curve = "";
    AW.forEach((db, i) => (curve += (i ? "L" : "M") + u(i).toFixed(1) + " " + v(db).toFixed(1)));
    s += `<g transform="${FRONT(PX, PYp + 5, PZ + 3 + PH)}">
      <rect class="glass" id="aw-glass" x="4" y="4" width="${PW - 8}" height="${PH - 8}" rx="3"/>
      ${slits(14, PW - 14, 14, 6, PH - 6, true)}${slits(14, PH - 14, 10, 6, PW - 6, false)}
      <line class="detail" x1="6" y1="${v(0)}" x2="${PW - 6}" y2="${v(0)}" style="stroke:var(--line);stroke-dasharray:3 2"/>
      <text class="label" x="${PW - 30}" y="${v(0) - 2.5}" font-size="4.2">0 dB</text>
      <path id="aw-curve" class="curve" d="${curve}"/>
      <text id="aw-name" class="label" x="${u(30)}" y="${v(1.3) - 6}" font-size="7">${esc(T.curve)}</text>
      <text class="label" x="8" y="${PH - 8}" font-size="4.6">← ${esc(T.low)}</text>
      <text class="label" x="${PW - 34}" y="${PH - 8}" font-size="4.6">${esc(T.high)} →</text>
      <path class="detail" style="stroke:var(--line)" d="M16 16 c-5 0 -8 4 -6.5 8.5 c1 3 3.5 4 3.5 7 c0 2.5 -2 3.5 -3 3.5 M16 16 c3.6 0 5.6 2.6 5 6 c-0.5 2.6 -2.6 3 -3 5"/>
    </g>`;

    // ---------- bins, Σ column, the wire between them ----------
    s += box(BX0 - 6, BY - 4, PZ, NB * BS + 8, BD + 8, 2, 2);
    s += `<g id="aw-bars"></g><path id="aw-tops" class="curve hot" d=""/>`;
    s += `<g transform="${TOP(0, 0, PZ + 2)}"><text class="label" x="${BX0}" y="${BY + BD + 9}" font-size="4.6">${esc(T.bins)}</text></g>`;
    const wire = path([[BX0 + NB * BS, BY + BD / 2, PZ + 2], [SUM.x, BY + BD / 2, PZ + 2]]);
    s += `<path class="wire hot" d="${wire}"/><path id="aw-pulse" class="pulse" pathLength="1000" d="${wire}"/>`;
    s += box(SUM.x - 4, SUM.y - 4, PZ, SUM.w + 8, SUM.d + 8, 2, 2);
    s += `<g id="aw-sum"></g>`;
    s += `<g transform="${TOP(0, 0, PZ)}"><text class="label" x="${SUM.x - 6}" y="${SUM.y + SUM.d + 14}" font-size="4.8">${esc(T.sumNote)}</text></g>`;
    // the other path: the 21 bands are stored as they are
    s += `<g transform="${TOP(0, 0, PZ)}"><text class="label" x="${BX0}" y="${BY + BD + 40}" font-size="4.8">${esc(T.bandsNote)}</text></g>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    const barsG = $(stage, "#aw-bars"), sumG = $(stage, "#aw-sum"), curveEl = $(stage, "#aw-curve"), glass = $(stage, "#aw-glass");
    const nameEl = $(stage, "#aw-name"), pulse = $(stage, "#aw-pulse"), tops = $(stage, "#aw-tops");
    const st = { on: true, m: 1, hold: 0, flipAt: 3.2, lastPulse: 0, drop: 0 };
    const toggle = () => {
      st.on = !st.on;
      st.hold = 7;
    };
    stage.addEventListener("click", toggle);
    const H = (db: number) => Math.max(1.5, (db - FLOOR) * 1.3); // dB → plate units

    api.loop((t, dt) => {
      if (st.hold > 0) st.hold -= dt;
      else if (t > st.flipAt) {
        st.on = !st.on;
        st.flipAt = t + 3.4;
      }
      st.m += ((st.on ? 1 : 0) - st.m) * Math.min(1, dt * 2.6);
      const m = ease(clamp(st.m));
      let bars = "", line = "";
      const levels: number[] = [];
      for (let i = 0; i < NB; i++) {
        const raw = RAW[i] + Math.sin(t * (2.1 + i * 0.07) + i) * 0.8;
        const l = raw + m * AW[i];
        levels.push(l);
        const x = BX0 + i * BS;
        if (m > 0.02) bars += K.boxc(x, BY, PZ + 2, BW, BD, H(raw), 0, "ghost");
        bars += K.boxc(x, BY, PZ + 2, BW, BD, H(l), 0, "bar");
        const q = P(x + BW / 2, BY + BD / 2, PZ + 2 + H(l) + 1.5);
        line += (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
      }
      barsG.innerHTML = bars;
      tops.setAttribute("d", line);
      tops.setAttribute("opacity", m.toFixed(2));
      // Σ is energy: 10·log₁₀ Σ 10^(L/10). It follows the loudest bins.
      const L = energy(levels), drop = L - L_RAW;
      st.drop = drop;
      const hs = H(L - 18), full = H(L_RAW - 18);
      const top = P(SUM.x + SUM.w, SUM.y + SUM.d, PZ + 2 + hs);
      sumG.innerHTML =
        K.boxc(SUM.x, SUM.y, PZ + 2, SUM.w, SUM.d, full, 0, "ghost") +
        K.boxc(SUM.x, SUM.y, PZ + 2, SUM.w, SUM.d, hs, 0, "bar") +
        `<g transform="${FRONT(SUM.x, SUM.y + SUM.d, PZ + 2 + hs)}"><text class="scr" x="${SUM.w / 2 - 4}" y="12" font-size="10" font-weight="700" style="fill:var(--bg)">${T.sum}</text></g>` +
        (m > 0.05 ? `<text class="tag" x="${(top[0] + 6).toFixed(1)}" y="${(top[1] + 2).toFixed(1)}">${esc(fmt(T.drop, { d: num(drop, 1) }))}</text>` : "");
      curveEl.classList.toggle("hot", m > 0.5);
      glass.classList.toggle("hot", m > 0.5);
      nameEl.setAttribute("class", m > 0.5 ? "scr" : "label");
      if (t - st.lastPulse > 0.6) {
        st.lastPulse = t;
        pulse.classList.remove("go");
        void (pulse as SVGGraphicsElement).getBoundingClientRect();
        pulse.classList.add("go");
      }
      api.power(true);
      api.readout(st.on ? fmt(T.weighted, { d: num(st.drop, 1) }) : T.raw);
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (toggle(), true) : false),
      unmount: () => stage.removeEventListener("click", toggle),
    };
  },
};

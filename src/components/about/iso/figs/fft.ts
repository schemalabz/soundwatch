// Fig 4 · Από χρόνο σε συχνότητες. An oscilloscope on the left shows the
// waveform; a beam carries it into a glass prism, and the prism fans it out
// into 21 bars, one per band, bass on the left, treble on the right, the way
// a prism splits light into colours. Three keys pick the source. The band
// shapes follow what the bench recordings showed: a motorbike is heaviest in
// the bass, voices peak around 500 Hz, construction climbs toward 8 kHz.

import { aboutStrings } from "@/lib/strings/about";
import { fmt, rng } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.fft;

const PZ = 8;
const NB = 21;
const BX0 = 214, BW = 4.6, BS = 6.6, BY = 54, BD = 12;
// target band heights per source (plate units)
const SPECTRA = [
  [64, 72, 66, 57, 50, 45, 41, 37, 34, 31, 28, 25, 22, 19, 16, 14, 12, 10, 8, 6, 5], // motorbike
  [20, 44, 56, 66, 72, 64, 52, 44, 39, 35, 31, 27, 23, 19, 15, 11, 9, 7, 6, 5, 4], // speech
  [16, 18, 20, 23, 26, 28, 31, 34, 37, 41, 45, 49, 54, 59, 64, 68, 72, 66, 57, 48, 40], // construction
];
const LABELS: [number, string][] = [[0, "<250"], [4, "500"], [7, "1k"], [11, "2,5k"], [16, "8k"], [20, "20k Hz"]];

export const fft: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [360, 0, 0], [0, 180, 0], [360, 180, 0], [168, 56, 80], [18, 62, 74], [BX0 + NB * BS, BY, 84]], 0.05);
    const { P, TOP, FRONT, box, path } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    s += box(0, 0, 0, 360, 180, PZ, 10);
    s += `<g transform="${TOP(0, 0, PZ)}"><rect class="detail" x="6" y="6" width="348" height="168" rx="6" opacity=".5"/></g>`;

    // ---------- oscilloscope ----------
    s += box(14, 56, PZ, 98, 18, 3, 2);
    s += box(20, 60, PZ + 3, 86, 6, 62, 3);
    s += `<g transform="${FRONT(20, 66, PZ + 65)}">
      <rect class="glass hot" x="5" y="5" width="76" height="46" rx="3"/>
      ${slits(12, 76, 8, 6, 50, true)}${slits(13, 45, 8, 6, 80, false)}
      <line class="detail" x1="6" y1="28" x2="80" y2="28" style="stroke:var(--line)"/>
      <path id="ff-wave" class="curve hot" d=""/>
      <text class="label" x="6" y="58.5" font-size="4.2">${esc(T.time)} →</text>
      ${[62, 70, 78].map((u) => `<circle class="face" cx="${u}" cy="57" r="2"/>`).join("")}
    </g>`;

    // ---------- the beam into the prism ----------
    const beam = path([[106, 66, PZ + 37], [154, 66, PZ + 37]]);
    s += `<path class="wire hot" d="${beam}" filter="url(#iso-soft)"/><path id="ff-pulse" class="pulse" pathLength="1000" d="${beam}"/>`;

    // ---------- rays: drawn before the prism so the prism sits over their roots ----------
    s += `<g id="ff-rays">${Array.from({ length: NB }, () => `<path class="ray" d=""/>`).join("")}</g>`;

    // ---------- the prism: a triangle in x–z, extruded along y ----------
    const A = 142, B = 194, MID = 168, TOPZ = PZ + 70, Y0 = 50, Y1 = 98;
    const poly = (pts: [number, number, number][]) => "M" + pts.map((p) => P(...p).map((n) => n.toFixed(2)).join(" ")).join("L") + "Z";
    s += `<path class="prism" d="${poly([[MID, Y0, TOPZ], [MID, Y1, TOPZ], [B, Y1, PZ], [B, Y0, PZ]])}"/>`;
    s += `<path class="prism front" d="${poly([[A, Y1, PZ], [B, Y1, PZ], [MID, Y1, TOPZ]])}"/>`;
    s += `<path class="detail" d="${path([[MID - 6, Y1, TOPZ - 14], [MID + 4, Y1, TOPZ - 30]])}"/>`;
    s += `<g transform="${FRONT(A, Y1, PZ + 22)}"><text class="scr" x="${MID - A - 9}" y="14" font-size="9" font-weight="700">FFT</text></g>`;

    // ---------- the spectrum: base rail, bars (filled each frame), labels ----------
    s += box(BX0 - 6, BY - 4, PZ, NB * BS + 10, BD + 8, 2, 2);
    s += `<g id="ff-bars"></g>`;
    s += `<g transform="${TOP(0, 0, PZ + 2)}">${LABELS.map(([i, l]) => `<text class="label" x="${BX0 + i * BS - 1}" y="${BY + BD + 8.5}" font-size="4.2">${l}</text>`).join("")}</g>`;
    s += `<g transform="${TOP(0, 0, PZ)}"><text class="label" x="${BX0 - 4}" y="${BY + BD + 18}" font-size="4.8">← ${esc(T.low)}</text><text class="label" x="${BX0 + NB * BS - 22}" y="${BY + BD + 18}" font-size="4.8">${esc(T.high)} →</text></g>`;

    // ---------- source keys ----------
    T.sources.forEach((name, i) => {
      const x = 18 + i * 46;
      s += `<g class="press src" data-hit="${i}">${box(x, 122, PZ, 42, 30, 6, 3)}<g transform="${TOP(x, 122, PZ + 6)}"><text class="label key" x="21" y="18" font-size="6.2" text-anchor="middle">${esc(name)}</text></g></g>`;
    });

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- live ----------
    const wave = $(stage, "#ff-wave"), barsG = $(stage, "#ff-bars"), rays = $$(stage, "#ff-rays path"), pulse = $(stage, "#ff-pulse");
    const keys = $$(stage, ".src");
    const r = rng(11);
    const phase = Array.from({ length: NB }, () => r() * 6.28), speed = Array.from({ length: NB }, () => 2 + r() * 3);
    const st = { src: 0, h: SPECTRA[0].slice(), lastPulse: 0 };
    const pick = (i: number) => {
      st.src = ((i % 3) + 3) % 3;
    };
    const onClick = (e: MouseEvent) => {
      const k = (e.target as Element).closest("[data-hit]");
      pick(k ? Number(k.getAttribute("data-hit")) : st.src + 1);
    };
    stage.addEventListener("click", onClick);

    // what each source looks like in time, on the scope (u ∈ 0…76, centred at 28)
    const signal = (src: number, x: number, t: number) => {
      if (src === 0) return Math.sin(x * 0.22 - t * 6) * 0.6 + Math.sin(x * 0.44 - t * 12) * 0.28 + Math.sin(x * 0.66 - t * 18) * 0.14;
      if (src === 1) {
        const env = Math.max(0, Math.sin(x * 0.08 - t * 2.4)) ** 1.5;
        return env * (Math.sin(x * 1.1 - t * 20) * 0.7 + Math.sin(x * 1.9 - t * 31) * 0.3);
      }
      const hit = Math.exp(-(((x * 0.12 - t * 3) % 3.1) + 3.1) % 3.1 * 2.2);
      return hit * Math.sin(x * 3.1 - t * 60) * 0.9 + Math.sin(x * 2.3 + t * 40) * 0.12;
    };

    api.loop((t, dt) => {
      let d = "";
      for (let u = 6; u <= 80; u += 0.7) d += (d ? "L" : "M") + u.toFixed(1) + " " + (28 - signal(st.src, u, t) * 19).toFixed(2);
      wave.setAttribute("d", d);
      if (t - st.lastPulse > 0.45) {
        st.lastPulse = t;
        pulse.classList.remove("go");
        void (pulse as SVGGraphicsElement).getBoundingClientRect();
        pulse.classList.add("go");
      }

      const target = SPECTRA[st.src];
      let bars = "";
      for (let i = 0; i < NB; i++) {
        const want = target[i] * (0.86 + 0.14 * Math.sin(t * speed[i] + phase[i]));
        st.h[i] += (want - st.h[i]) * Math.min(1, dt * 5);
        const h = Math.max(2, st.h[i]);
        const x = BX0 + i * BS;
        bars += K.boxc(x, BY, PZ + 2, BW, BD, h, 0, "bar");
        const top = P(x + BW / 2, BY + BD, PZ + 2 + h);
        const src = P(B - 10, (Y0 + Y1) / 2, PZ + 34);
        rays[i].setAttribute("d", `M${src[0].toFixed(1)} ${src[1].toFixed(1)}L${top[0].toFixed(1)} ${top[1].toFixed(1)}`);
      }
      barsG.innerHTML = bars;
      keys.forEach((k, i) => k.classList.toggle("latched", i === st.src));
      api.power(true);
      api.readout(fmt(T.readout, { source: T.sources[st.src], peak: T.peaks[st.src] }));
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (pick(st.src + 1), true) : false),
      unmount: () => stage.removeEventListener("click", onClick),
    };
  },
};

// Fig 6 · Άθροισμα, όχι ντεσιμπέλ. Each analysed frame leaves the processor
// as a small block and drops into one of 55 glass tubes, 2 dB wide each from
// 20 to 130 dB (firmware 1.2), by its level; the adder in front counts frames
// and energy, and its dial runs round once per interval. When the interval
// closes the line leaves for the network and everything empties. Click for a
// car horn.

import { aboutStrings } from "@/lib/strings/about";
import { fmt, num, rng, clamp, type Pt3 } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.accumulate;

const PZ = 8;
const NB = 55, BX0 = 104, BS = 4.4, BW = 3.3, BY = 96, BD = 12, TUBE = 72, UNIT = 2.4;
const INTERVAL = 9; // figure seconds per interval (stands for ~27 s)
const RATE = 20; // blocks per second dropped
const PER_BLOCK = 4; // frames each block stands for: ~670 per interval, as on the fleet (~689)
const SRC: Pt3 = [36, 30, PZ + 16];
const LO_DB = 20; // lower edge of tube 0
const SUMB = { x: 18, y: 118, w: 66, d: 52, h: 32 };

export const accumulate: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [370, 0, 0], [0, 200, 0], [370, 200, 0], [BX0 + NB * BS + 70, BY, PZ + TUBE + 34], [SRC[0], SRC[1], PZ + 70], [370, 60, 60]], 0.05);
    const { P, TOP, FRONT, SIDE, box, boxc, rect, path } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    s += box(0, 0, 0, 370, 200, PZ, 10);
    s += `<g transform="${TOP(0, 0, PZ)}"><rect class="detail" x="6" y="6" width="358" height="188" rx="6" opacity=".5"/></g>`;

    // ---------- the processor the frames come from ----------
    s += box(14, 12, PZ, 46, 38, 8, 2);
    s += `<g transform="${FRONT(14, 50, PZ + 8)}">${slits(4, 42, 3, 6, 8)}</g><g transform="${SIDE(60, 50, PZ + 8)}">${slits(4, 34, 3, 6, 8)}</g>`;
    s += `<g transform="${TOP(14, 12, PZ + 8)}"><circle id="ac-core" class="led" cx="23" cy="19" r="5"/></g>`;

    // ---------- tubes: bars go inside, glass drawn over them ----------
    s += box(BX0 - 6, BY - 4, PZ, NB * BS + 10, BD + 8, 2, 2);
    s += `<g id="ac-bars"></g>`;
    let tubes = "";
    for (let i = 0; i < NB; i++) {
      const x = BX0 + i * BS;
      tubes += rect(SIDE(x + BW, BY + BD, PZ + 2 + TUBE), BD, TUBE, 0, "face ghost") + rect(FRONT(x, BY + BD, PZ + 2 + TUBE), BW, TUBE, 0, "face ghost");
      tubes += rect(TOP(x, BY, PZ + 2 + TUBE), BW, BD, 0, "face ghost");
    }
    s += `<g opacity=".6">${tubes}</g>`;
    // axis labels sit at the tube whose lower edge is the labelled level
    s += `<g transform="${TOP(0, 0, PZ + 2)}">${T.bins.map((l) => `<text class="label" x="${BX0 + Math.min(NB - 1, (Number(l) - LO_DB) / 2) * BS}" y="${BY + BD + 8}" font-size="4.4">${l}</text>`).join("")}</g>`;

    // ---------- the adder: a screen with Σ, a dial on top ----------
    s += box(SUMB.x, SUMB.y, PZ, SUMB.w, SUMB.d, SUMB.h, 3);
    s += `<g transform="${FRONT(SUMB.x, SUMB.y + SUMB.d, PZ + SUMB.h)}">
      <rect class="glass hot" x="5" y="5" width="${SUMB.w - 10}" height="${SUMB.h - 10}" rx="2"/>
      <text class="label" x="9" y="12" font-size="4">${esc(T.sum)}</text>
      <text id="ac-sum" class="scr" x="9" y="20.5" font-size="7.5">0</text>
      <text id="ac-frames" class="label" x="9" y="${SUMB.h - 7}" font-size="4">0</text>
    </g>`;
    let ticks = "";
    for (let k = 0; k < 27; k++) {
      const a = (k / 27) * Math.PI * 2 - Math.PI / 2;
      ticks += `<line class="detail" x1="${(SUMB.w / 2 + 14 * Math.cos(a)).toFixed(2)}" y1="${(SUMB.d / 2 + 14 * Math.sin(a)).toFixed(2)}" x2="${(SUMB.w / 2 + 16.5 * Math.cos(a)).toFixed(2)}" y2="${(SUMB.d / 2 + 16.5 * Math.sin(a)).toFixed(2)}"/>`;
    }
    s += `<g transform="${TOP(SUMB.x, SUMB.y, PZ + SUMB.h)}">
      <circle class="face recess" cx="${SUMB.w / 2}" cy="${SUMB.d / 2}" r="17"/>${ticks}
      <circle id="ac-dial" class="prog" cx="${SUMB.w / 2}" cy="${SUMB.d / 2}" r="11" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 ${SUMB.w / 2} ${SUMB.d / 2})"/>
      <text id="ac-sec" class="label" x="${SUMB.w / 2}" y="${SUMB.d / 2 + 1.8}" font-size="5" text-anchor="middle">0</text>
    </g>`;

    // ---------- falling frames, and the line that leaves at the end ----------
    s += `<g id="ac-drops">${Array.from({ length: 34 }, () => `<g opacity="0">${box(-1.8, -1.8, 0, 3.6, 3.6, 3.6, 0)}</g>`).join("")}</g>`;
    const out: Pt3[] = [[SUMB.x + SUMB.w, SUMB.y + SUMB.d / 2, PZ + 4], [372, SUMB.y + SUMB.d / 2, PZ + 4]];
    s += `<path id="ac-outwire" class="wire" d="${path(out)}"/><path id="ac-pulse" class="pulse" pathLength="1000" d="${path(out)}"/>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- live ----------
    const barsG = $(stage, "#ac-bars"), core = $(stage, "#ac-core"), dial = $(stage, "#ac-dial"), sec = $(stage, "#ac-sec");
    const sumEl = $(stage, "#ac-sum"), framesEl = $(stage, "#ac-frames"), outwire = $(stage, "#ac-outwire"), pulse = $(stage, "#ac-pulse");
    const drops = $$(stage, "#ac-drops > g").map((el) => ({ el, bin: 0, t0: -1, live: false }));
    const r = rng(29);
    const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

    const st = { counts: new Array(NB).fill(0) as number[], frames: 0, energy: 0, start: 0, emitted: 0, horn: 0, hornK: 0, flashUntil: -1, sentAt: -9, dirty: true, di: 0 };
    const horn = () => {
      st.horn = 26;
      st.hornK = 0;
    };
    stage.addEventListener("click", horn);

    const landing = (bin: number): Pt3 => [BX0 + bin * BS + BW / 2, BY + BD / 2, PZ + 2 + Math.min(TUBE, st.counts[bin] * UNIT) + 2];
    const drawBars = (flash: boolean) => {
      let o = "";
      for (let i = 0; i < NB; i++) {
        const h = Math.min(TUBE - 0.5, st.counts[i] * UNIT);
        if (h > 0) o += boxc(BX0 + i * BS, BY, PZ + 2, BW, BD, h, 0, "bar");
      }
      barsG.innerHTML = o;
      if (flash) barsG.setAttribute("filter", "url(#iso-glow)");
      else barsG.removeAttribute("filter");
    };

    api.loop((t) => {
      const el = t - st.start;
      // emit frames at a steady rate; a horn adds a burst of loud ones
      const due = Math.floor(Math.max(0, el) * RATE);
      while (st.emitted < due && el < INTERVAL - 0.6) {
        st.emitted++;
        // a street at ~52 dB (tube 16), now and then a louder passer-by
        let bin = Math.round(16 + gauss() * 3.2 + (r() < 0.06 ? 6 + r() * 6 : 0));
        if (st.horn > 0) {
          bin = 33 + Math.floor(r() * 7); // ~86-100 dB
          st.horn--;
          st.hornK += PER_BLOCK;
        }
        bin = Math.max(0, Math.min(NB - 1, bin));
        const d = drops[st.di++ % drops.length];
        d.bin = bin;
        d.t0 = t;
        d.live = true;
      }
      core.classList.toggle("hot", el >= 0 && el < INTERVAL - 0.6);
      // flight: a short arc from the processor to the tube
      for (const d of drops) {
        if (!d.live) continue;
        const f = (t - d.t0) / 0.75;
        if (f >= 1) {
          d.live = false;
          d.el.setAttribute("opacity", "0");
          st.counts[d.bin]++;
          st.frames += PER_BLOCK;
          st.energy += (PER_BLOCK * Math.pow(10, (LO_DB + d.bin * 2) / 10)) / 1e3;
          st.dirty = true;
          continue;
        }
        const E = landing(d.bin);
        const x = SRC[0] + (E[0] - SRC[0]) * f, y = SRC[1] + (E[1] - SRC[1]) * f;
        const z = SRC[2] + (E[2] - SRC[2]) * f + Math.sin(f * Math.PI) * 54;
        const q = P(x, y, z), o = P(0, 0, 0);
        d.el.setAttribute("transform", `translate(${(q[0] - o[0]).toFixed(2)} ${(q[1] - o[1]).toFixed(2)})`);
        d.el.setAttribute("opacity", "1");
        d.el.setAttribute("class", "press latched");
      }
      const flash = t < st.flashUntil;
      if (st.dirty || flash) {
        drawBars(flash);
        st.dirty = !!flash;
      }
      // dial and screen
      const secs = Math.max(0, Math.min(27, Math.floor((el / INTERVAL) * 27)));
      dial.setAttribute("stroke-dasharray", `${(clamp(el / INTERVAL) * 100).toFixed(1)} 100`);
      sec.textContent = String(secs);
      sumEl.textContent = num(Math.round(st.energy));
      framesEl.textContent = fmt(T.frames, { n: num(st.frames) });
      // the interval closes: flash, send, empty
      if (el >= INTERVAL) {
        st.flashUntil = t + 0.5;
        st.sentAt = t;
        pulse.classList.remove("go");
        void (pulse as SVGGraphicsElement).getBoundingClientRect();
        pulse.classList.add("go");
        st.start = t + 0.6;
        st.emitted = 0;
        st.counts.fill(0);
        st.frames = 0;
        st.energy = 0;
        st.hornK = 0;
        st.dirty = true;
      }
      outwire.classList.toggle("hot", t - st.sentAt < 0.8);
      api.power(true);
      api.readout(
        t - st.sentAt < 1.4 ? T.sent : st.hornK > 0 ? fmt(T.horn, { k: num(st.hornK) }) : fmt(T.running, { n: num(st.frames), s: num(secs) })
      );
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (horn(), true) : false),
      unmount: () => stage.removeEventListener("click", horn),
    };
  },
};

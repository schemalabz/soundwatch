// Fig 3 · Ένα καρέ ήχου. Sound as a strip of film, cut into frames of 512
// samples, sliding under the analysis gate. The processor takes one frame,
// and while it is still busy with that frame's FFT the next two slide past
// unread: one in three is analysed. Click to send a short bang down the
// strip and see whether it lands in a frame that gets read.

import { aboutStrings } from "@/lib/strings/about";
import { fmt, num, clamp, type Pt3 } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.frame;

const PZ = 8, TZ = PZ + 4; // plate top, film top
const FY0 = 44, FY1 = 88; // film edges along y
const CELL = 40, GATE = 150, LEN = 340;
const F = 0.62; // seconds per frame on screen
const BUSY = 2.4; // frames' worth of time the processor needs per analysed frame
const NPOOL = 11;

export const frame: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [LEN, 0, 0], [0, 170, 0], [LEN, 170, 0], [GATE, FY0, 52], [0, 40, 60], [LEN, 0, 40]], 0.05);
    const { P, TOP, FRONT, SIDE, box, cyl, path, pt } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    s += box(0, 0, 0, LEN, 170, PZ, 10);
    s += `<g transform="${TOP(0, 0, PZ)}"><rect class="detail" x="6" y="6" width="${LEN - 12}" height="158" rx="6" opacity=".5"/></g>`;
    // rollers at both ends, the film runs between them
    for (const x of [6, LEN - 6]) {
      const pts: Pt3[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push([x + 5 * Math.cos(a), FY0 - 2, PZ + 6 + 5 * Math.sin(a)], [x + 5 * Math.cos(a), FY1 + 2, PZ + 6 + 5 * Math.sin(a)]);
      }
      s += `<path class="face" d="${K.hull(pts)}"/><g transform="${FRONT(x, FY1 + 2, PZ + 6)}"><circle class="face top" r="5"/><circle class="detail" r="1.5"/></g>`;
    }
    s += box(0, FY0, PZ, LEN, FY1 - FY0, 4, 0);

    // back posts of the gate, behind the film
    s += box(GATE - 3, FY0 - 7, PZ, 3, 3, 40, 0) + box(GATE + CELL, FY0 - 7, PZ, 3, 3, 40, 0);

    // ---------- the moving film: frames, sprocket holes, waveform ----------
    const clip = [P(0, FY0, TZ), P(LEN, FY0, TZ), P(LEN, FY1, TZ), P(0, FY1, TZ)].map((p) => p.map((n) => n.toFixed(2)).join(" "));
    s += `<defs><clipPath id="fr-clip"><path d="M${clip.join("L")}Z"/></clipPath></defs>`;
    s += `<g clip-path="url(#fr-clip)"><g transform="${TOP(0, FY0, TZ)}">`;
    for (let i = 0; i < NPOOL; i++) {
      let holes = "";
      for (let k = 0; k < 5; k++) holes += `<rect class="face recess" x="${3 + k * 8}" y="2" width="4" height="3" rx="0.8"/><rect class="face recess" x="${3 + k * 8}" y="${FY1 - FY0 - 5}" width="4" height="3" rx="0.8"/>`;
      s += `<g class="fr-cell" transform="translate(-999 0)">
        <rect class="cellbg glass" x="1" y="8" width="${CELL - 2}" height="${FY1 - FY0 - 16}" rx="1.5"/>
        ${holes}
        <path class="cellwave curve" d=""/>
      </g>`;
    }
    s += `</g></g>`;

    // ---------- the gate: a slim portal over one frame, with a light curtain ----------
    const GH = 40, PT = 3, gx0 = GATE - PT, gx1 = GATE + CELL, gy0 = FY0 - 7, gy1 = FY1 + 4;
    s += `<g transform="${TOP(GATE, FY0, TZ)}"><rect id="fr-curtain" class="halo" x="0" y="0" width="${CELL}" height="${FY1 - FY0}" filter="url(#iso-bloom)"/><rect id="fr-window" class="gatewin" x="0.5" y="0.5" width="${CELL - 1}" height="${FY1 - FY0 - 1}"/></g>`;
    const wirePts: Pt3[] = [[GATE + CELL / 2, gy1 + PT, PZ], [GATE + CELL / 2, 128, PZ], [208, 128, PZ]];
    s += `<path id="fr-wire" class="wire" d="${path(wirePts)}"/><path id="fr-pulse" class="pulse" pathLength="1000" d="${path(wirePts)}"/>`;
    s += box(gx0, gy1, PZ, PT, PT, GH, 0) + box(gx1, gy1, PZ, PT, PT, GH, 0);
    s += box(gx0, gy0, PZ + GH, PT, gy1 + PT - gy0, PT, 0); // left beam, along y
    s += box(gx1, gy0, PZ + GH, PT, gy1 + PT - gy0, PT, 0); // right beam
    s += box(gx0, gy1, PZ + GH, gx1 + PT - gx0, PT, PT, 0); // front beam, along x
    s += `<g transform="${FRONT(gx0, gy1 + PT, PZ + GH + PT)}"><rect id="fr-strip" class="glass" x="5" y="0.6" width="${CELL - 4}" height="1.8" rx="0.9"/></g>`;
    const lab = P(gx1 + PT, gy1 + PT, PZ + GH + 14);
    s += `<path class="leader" d="M${pt(gx1 + PT, gy1 + PT, PZ + GH + PT)}L${lab[0].toFixed(1)} ${lab[1].toFixed(1)}h8"/><text class="cap" x="${(lab[0] + 10).toFixed(1)}" y="${(lab[1] + 2.5).toFixed(1)}">${esc(T.gate)}</text>`;

    // ---------- the processor, with a progress ring for its FFT ----------
    const CX = 208, CY = 108, CW = 48, CD = 42, CH = 8;
    s += box(CX, CY, PZ, CW, CD, CH, 2);
    s += `<g transform="${FRONT(CX, CY + CD, PZ + CH)}">${slits(4, CW - 4, 3, CH - 2, CH)}</g><g transform="${SIDE(CX + CW, CY + CD, PZ + CH)}">${slits(4, CD - 4, 3, CH - 2, CH)}</g>`;
    s += `<g transform="${TOP(CX, CY, PZ + CH)}">
      <circle class="detail" cx="${CW / 2}" cy="${CD / 2}" r="13"/>
      <circle id="fr-prog" class="prog" cx="${CW / 2}" cy="${CD / 2}" r="13" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 ${CW / 2} ${CD / 2})"/>
      <circle id="fr-core" class="led" cx="${CW / 2}" cy="${CD / 2}" r="5"/>
      <text class="label" x="3" y="${CD - 3}" font-size="4">${esc(T.chip)}</text>
    </g>`;
    s += cyl(CX - 8, CY + 6, PZ, 3, 6) + cyl(CX - 8, CY + 18, PZ, 3, 6);

    // ---------- counters ----------
    const hx = K.W * 0.62, hy = K.H * 0.08;
    s += `<text class="cap" x="${hx}" y="${hy}">${esc(T.tape)} →</text>
      <text id="fr-an" class="cap hi" x="${hx}" y="${hy + 13}"></text>
      <text id="fr-mi" class="cap" x="${hx}" y="${hy + 24}"></text>`;
    // bang marker label, follows the bang frame
    s += `<g id="fr-banglab" opacity="0"><path class="leader" d=""/><text class="tag" x="0" y="0" text-anchor="middle">${esc(T.bang)}</text></g>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- live ----------
    const cells = $$(stage, ".fr-cell").map((g) => ({
      g,
      bg: g.querySelector(".cellbg")!,
      wave: g.querySelector(".cellwave")!,
      n: -1,
    }));
    const curtain = $(stage, "#fr-curtain");
    const win = $(stage, "#fr-window"), strip = $(stage, "#fr-strip"), wire = $(stage, "#fr-wire"), pulse = $(stage, "#fr-pulse");
    const prog = $(stage, "#fr-prog"), core = $(stage, "#fr-core");
    const an = $(stage, "#fr-an"), mi = $(stage, "#fr-mi"), bangLab = $(stage, "#fr-banglab");
    const bangLeader = bangLab.querySelector("path")!, bangText = bangLab.querySelector("text")!;

    const st = { bang: -1, verdict: "" as "" | "caught" | "escaped", verdictAt: -9, lastPulse: -1 };
    const analysed = (n: number) => n >= 0 && n % 3 === 0;
    const fire = (t: number) => {
      // the bang rides in on the next frame to enter the film from the left
      st.bang = Math.ceil(t / F + GATE / CELL) + 1;
      st.verdict = "";
    };
    let clock = 0;
    const onClick = () => fire(clock);
    stage.addEventListener("click", onClick);

    const waveFor = (n: number, bang: boolean) => {
      let d = "";
      const H = FY1 - FY0, mid = H / 2;
      for (let x = 2; x <= CELL - 2; x += 1) {
        const k = n * 40 + x;
        let y = Math.sin(k * 0.55) * 6 + Math.sin(k * 0.21 + n) * 4 + Math.sin(k * 1.7) * 1.4;
        if (bang && x > 16 && x < 24) y += (x % 2 ? 1 : -1) * 13 * (1 - Math.abs(x - 20) / 4);
        d += (d ? "L" : "M") + x + " " + (mid + y).toFixed(2);
      }
      return d;
    };

    api.loop((t) => {
      clock = t;
      const head = t / F; // frames passed since start (frame n is under the gate during [n, n+1))
      const nUnder = Math.floor(head);
      for (let k = 0; k < NPOOL; k++) {
        // frames nUnder-4 … nUnder+6 are on the film
        const n = nUnder - 4 + k;
        const c = cells[((n % NPOOL) + NPOOL) % NPOOL];
        const x = GATE + (head - n) * CELL;
        if (c.n !== n) {
          c.n = n;
          c.wave.setAttribute("d", waveFor(n, n === st.bang));
        }
        c.g.setAttribute("transform", `translate(${x.toFixed(2)} 0)`);
        const passed = x > GATE + CELL * 0.98, under = x >= GATE - 0.5 && !passed;
        const lit = analysed(n) && (under || passed);
        c.bg.classList.toggle("hot", lit);
        c.wave.classList.toggle("hot", lit);
        c.wave.setAttribute("opacity", passed && !analysed(n) ? "0.3" : "1");
        if (n === st.bang) {
          const q = P(x + 20, FY0, TZ + 26), base = P(x + 20, FY0 + 10, TZ);
          bangLab.setAttribute("opacity", x > -30 && x < LEN - 10 ? "1" : "0");
          bangText.setAttribute("x", q[0].toFixed(1));
          bangText.setAttribute("y", (q[1] - 3).toFixed(1));
          bangLeader.setAttribute("d", `M${base[0].toFixed(1)} ${base[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
          if (!st.verdict && passed) {
            st.verdict = analysed(n) ? "caught" : "escaped";
            st.verdictAt = t;
          }
          if (x > LEN + 20) st.bang = -1;
        }
      }
      if (st.bang < 0) bangLab.setAttribute("opacity", "0");

      // the gate and the processor
      const capturing = analysed(nUnder);
      win.classList.toggle("hot", capturing);
      curtain.classList.toggle("hot", capturing);
      strip.classList.toggle("hot", capturing);
      const lastA = nUnder - (((nUnder % 3) + 3) % 3);
      const busy = lastA >= 0 ? clamp((head - lastA) / BUSY) : 0;
      const working = lastA >= 0 && head - lastA < BUSY;
      prog.setAttribute("stroke-dasharray", `${(working ? busy * 100 : 0).toFixed(1)} 100`);
      core.classList.toggle("hot", working);
      if (capturing && st.lastPulse !== nUnder && head - nUnder > 0.85) {
        st.lastPulse = nUnder;
        pulse.classList.remove("go");
        void (pulse as SVGGraphicsElement).getBoundingClientRect();
        pulse.classList.add("go");
      }
      wire.classList.toggle("hot", working);

      // frames 0 … nUnder−1 have passed the gate; every third was read
      const done = Math.max(0, nUnder), read = Math.ceil(done / 3);
      an.textContent = fmt(T.analysed, { n: num(read) });
      mi.textContent = fmt(T.missed, { n: num(done - read) });
      api.power(true);
      const showVerdict = st.verdict && t - st.verdictAt < 3.5;
      api.readout(
        showVerdict ? (st.verdict === "caught" ? T.caught : T.escaped) : st.bang >= 0 ? T.waiting : fmt(T.running, { n: num(done) })
      );
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (onClick(), true) : false),
      unmount: () => stage.removeEventListener("click", onClick),
    };
  },
};

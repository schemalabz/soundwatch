// Fig 2 · Το μικρόφωνο. The sensor taken apart, as a service plate: base
// tray, battery, the board with its chips, and the lid lifted off as a
// wireframe. Sound arrives through the port in the lid's side and lands on
// the MEMS microphone, which glows. The magnifier shows what happens inside
// it: a membrane that bows with the pressure, and the circuit reading its
// position at fixed instants — the samples, newest on the right.

import { aboutStrings } from "@/lib/strings/about";
import { along, num, fmt, type Pt3 } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.mic;

const TRAY = { z: 0, h: 16 }, BATT = { z: 30, h: 7 }, BOARD = { z: 54, h: 3 }, LID = { z: 104, h: 12 };
const BZ = BOARD.z + BOARD.h; // top of the board
const MIC = { x: 120, y: 78, w: 10, d: 10 };
const PORT: Pt3 = [150, MIC.y + 5, BZ + 4];

export const mic: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [150, 0, 0], [0, 104, 0], [150, 104, 0], [0, 0, LID.z + LID.h], [150, 104, LID.z + LID.h], [215, 84, BZ], [0, 190, 250]], 0.04);
    const { P, TOP, FRONT, SIDE, box, boxc, path, pt } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    // assembly guides at the four corner screws, behind every part
    for (const [x, y] of [[8, 8], [142, 8], [8, 96], [142, 96]]) s += `<path class="leader" d="M${pt(x, y, TRAY.h)}L${pt(x, y, LID.z)}"/>`;

    // ---------- base tray ----------
    s += box(0, 0, TRAY.z, 150, 104, TRAY.h, 8);
    s += `<g transform="${TOP(0, 0, TRAY.h)}">
      <rect class="face recess" x="6" y="6" width="138" height="92" rx="5"/>
      ${[[8, 8], [142, 8], [8, 96], [142, 96]].map(([x, y]) => `<circle class="face" cx="${x}" cy="${y}" r="3"/><circle class="detail" cx="${x}" cy="${y}" r="1.2"/>`).join("")}
      <rect class="detail" x="20" y="22" width="84" height="60" rx="3"/>
    </g>`;
    s += `<g transform="${FRONT(0, 104, TRAY.h)}">${slits(40, 110, 4, 5, 11)}</g>`;
    s += `<g transform="${SIDE(150, 104, TRAY.h)}"><rect class="face recess" x="44" y="5" width="12" height="7" rx="2"/></g>`;

    // ---------- battery pack ----------
    s += box(24, 26, BATT.z, 80, 56, BATT.h, 4);
    s += `<g transform="${TOP(24, 26, BATT.z + BATT.h)}"><rect class="detail" x="6" y="6" width="68" height="44" rx="3"/><text class="label" x="12" y="30" font-size="7">LiPo 2000 mAh</text></g>`;
    s += `<path class="wire" d="${path([[100, 54, BATT.z + BATT.h], [112, 54, BATT.z + 12], [112, 40, BZ]])}"/>`;

    // ---------- the board ----------
    s += box(2, 2, BOARD.z, 146, 100, BOARD.h, 5);
    let traces = "";
    const lines: [number, number][][] = [
      [[44, 22], [56, 22], [56, 34], [62, 34]],
      [[44, 28], [52, 28], [52, 40], [62, 40]],
      [[86, 38], [104, 38], [104, 24], [124, 24]],
      [[86, 46], [110, 46], [110, 60]],
      [[40, 78], [52, 78], [52, 56], [62, 56]],
      [[20, 50], [30, 50], [30, 66]],
      [[74, 62], [74, 86], [100, 86]],
    ];
    for (const l of lines) traces += `<path class="detail" d="M${l.map((p) => p.join(" ")).join("L")}"/>`;
    s += `<g transform="${TOP(2, 2, BZ)}">${traces}
      ${[[8, 8], [138, 8], [8, 92], [138, 92]].map(([x, y]) => `<circle class="face recess" cx="${x}" cy="${y}" r="3.4"/>`).join("")}
      <rect class="detail" x="110" y="66" width="30" height="26" rx="2"/>
    </g>`;
    // Wi-Fi module with its printed antenna
    s += `<g transform="${TOP(2, 2, BZ)}"><path class="detail" d="M10 6 h6 v6 h6 v-6 h6 v6 h6 v-6 h6"/></g>`;
    s += box(10, 14, BZ, 32, 22, 4, 1) + box(14, 18, BZ + 4, 22, 14, 2, 1);
    s += `<g transform="${TOP(14, 18, BZ + 6)}"><text class="label" x="2" y="8.5" font-size="4.6">ESP8266</text></g>`;
    // microcontroller, legs on two faces
    s += box(62, 30, BZ, 24, 24, 3, 1);
    s += `<g transform="${FRONT(62, 54, BZ + 3)}">${slits(2, 22, 2, 1, 3)}</g><g transform="${SIDE(86, 54, BZ + 3)}">${slits(2, 22, 2, 1, 3)}</g>`;
    s += `<g transform="${TOP(62, 30, BZ + 3)}"><circle class="detail" cx="4" cy="4" r="1.3"/><text class="label" x="3.5" y="14" font-size="4.6">SAMD21</text></g>`;
    // SD slot, USB socket, a handful of passives
    s += box(14, 62, BZ, 24, 20, 2.6, 1) + `<g transform="${TOP(14, 62, BZ + 2.6)}">${slits(4, 20, 3, 4, 16)}</g>`;
    s += box(-3, 38, BZ, 10, 14, 5, 1) + `<g transform="${SIDE(7, 52, BZ + 5)}"><rect class="face recess" x="3" y="1.5" width="8" height="2.4" rx="1"/></g>`;
    for (const [x, y] of [[50, 24], [50, 46], [92, 30], [92, 52], [100, 70], [58, 70], [66, 70], [110, 30], [120, 44], [34, 44]]) s += box(x, y, BZ, 4, 2, 1.4, 0);
    // the I²S line from the microphone to the processor, and its bits
    const BUS: Pt3[] = [[MIC.x + 5, MIC.y, BZ], [MIC.x + 5, 66, BZ], [96, 66, BZ], [96, 50, BZ], [86, 50, BZ]];
    s += `<path id="mc-bus" class="wire" d="${path(BUS)}"/>`;
    s += `<g id="mc-bits">${Array.from({ length: 7 }, () => `<rect class="bit" width="2.6" height="2.6" x="-1.3" y="-1.3"/>`).join("")}</g>`;
    // the microphone itself: a little can with a port in its lid
    s += `<circle id="mc-halo" class="halo" cx="${P(MIC.x + 5, MIC.y + 5, BZ + 4)[0].toFixed(1)}" cy="${P(MIC.x + 5, MIC.y + 5, BZ + 4)[1].toFixed(1)}" r="12" filter="url(#iso-bloom)"/>`;
    s += `<g id="mc-mic" class="press">${box(MIC.x, MIC.y, BZ, MIC.w, MIC.d, 4, 1.5)}</g>`;
    s += `<g transform="${TOP(MIC.x, MIC.y, BZ + 4)}"><circle class="face recess" cx="5" cy="5" r="1.6"/></g>`;

    // ---------- incoming sound: ripples closing in on the port ----------
    s += `<g id="mc-waves">${Array.from({ length: 4 }, () => `<path class="ring" d=""/>`).join("")}</g>`;

    // ---------- the lid, lifted: a wireframe with its port and grille ----------
    s += boxc(0, 0, LID.z, 150, 104, LID.h, 8, "ghost");
    s += `<g transform="${TOP(0, 0, LID.z + LID.h)}">${slits(30, 120, 6, 30, 74, true, "detail")}</g>`;
    s += `<g transform="${SIDE(150, 104, LID.z + LID.h)}"><circle class="face ghost" cx="${104 - PORT[1]}" cy="6" r="2.4"/></g>`;
    s += `<path class="leader" d="M${pt(150, PORT[1], LID.z + 6)}L${pt(150, PORT[1], BZ + 4)}"/>`;

    // ---------- labels ----------
    const lab = (to: Pt3, dx: number, dy: number, text: string, anchor: "start" | "end" = "start") => {
      const a = P(...to);
      const b: [number, number] = [a[0] + dx, a[1] + dy];
      return `<path class="leader" d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}h${anchor === "start" ? 8 : -8}"/>
        <text class="cap" x="${(b[0] + (anchor === "start" ? 10 : -10)).toFixed(1)}" y="${(b[1] + 2.5).toFixed(1)}" text-anchor="${anchor}">${esc(text)}</text>`;
    };
    s += lab([150, 60, LID.z + LID.h], 18, -14, T.lid);
    s += lab([150, 90, BZ], 26, 10, T.board);
    s += lab([74, 54, BZ + 3], -30, 30, T.mcu, "end");
    s += lab([10, 36, BZ + 4], -16, -10, T.wifi, "end");

    // ---------- the magnifier ----------
    const MX = K.W * 0.03, MY = K.H * 0.04, MW = K.W * 0.46, MH = K.H * 0.27;
    const cx = MX + MW * 0.2, cy = MY + MH * 0.56, r = MH * 0.32; // the cross-section
    const PX0 = MX + MW * 0.42, PX1 = MX + MW - 10, PY = MY + MH * 0.56; // the sample plot
    const NS = 22;
    const micP = P(MIC.x + 5, MIC.y + 5, BZ + 4);
    s += `<path class="leader" d="M${(MX + MW * 0.2).toFixed(1)} ${(MY + MH).toFixed(1)}L${micP[0].toFixed(1)} ${micP[1].toFixed(1)}"/>`;
    s += `<rect class="plate" x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="6"/>`;
    s += `<text class="cap" x="${MX + 8}" y="${MY + 11}">${esc(T.zoom)}</text><text class="cap" x="${PX0}" y="${MY + 11}">${esc(T.samples)}</text>`;
    // cross-section: housing, port below, backplate above, membrane between
    s += `<path class="mast" d="M${cx - r} ${cy - r * 0.9}V${cy + r * 0.75}H${cx - r * 0.22}M${cx + r * 0.22} ${cy + r * 0.75}H${cx + r}V${cy - r * 0.9}H${cx - r}"/>`;
    s += `<path class="detail" style="stroke-dasharray:2 2" d="M${cx - r * 0.82} ${cy - r * 0.38}H${cx + r * 0.82}"/>`;
    s += `<path id="mc-membrane" class="curve" d=""/>`;
    s += `<path id="mc-in" class="ring" d=""/>`;
    // plot
    s += `<line class="detail" x1="${PX0}" y1="${PY}" x2="${PX1}" y2="${PY}"/><path id="mc-trace" class="detail" d=""/>`;
    for (let i = 0; i < NS; i++) s += `<line class="stem wire" x1="0" y1="${PY}" x2="0" y2="${PY}"/><circle class="stemdot led" r="1.2" cx="0" cy="${PY}"/>`;
    s += `<text id="mc-bitsline" class="tag" x="${PX0}" y="${MY + MH - 7}">0</text>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- live ----------
    const micG = $(stage, "#mc-mic"), halo = $(stage, "#mc-halo"), bus = $(stage, "#mc-bus");
    const bits = $$(stage, "#mc-bits rect"), waves = $$(stage, "#mc-waves path");
    const membrane = $(stage, "#mc-membrane"), inArrow = $(stage, "#mc-in"), trace = $(stage, "#mc-trace");
    const stems = $$(stage, ".stem"), dots = $$(stage, ".stemdot"), bitsLine = $(stage, "#mc-bitsline");
    const st = { on: true, amp: 1, count: 0 };
    const toggle = () => void (st.on = !st.on);
    stage.addEventListener("click", toggle);

    // the "sound": two partials, slowed down by a factor of a few thousand
    const signal = (t: number) => Math.sin(t * 6.2) * 0.72 + Math.sin(t * 15.1 + 1) * 0.28;
    const SAMPLE_DT = 0.085; // seconds of figure time between samples

    api.loop((t, dt) => {
      st.amp += ((st.on ? 1 : 0) - st.amp) * Math.min(1, dt * 3);
      const on = st.amp > 0.05;
      micG.classList.toggle("latched", on);
      halo.classList.toggle("hot", on);
      bus.classList.toggle("hot", on);
      api.power(st.on);

      // ripples: radius shrinks toward the port, in the horizontal plane at port height
      waves.forEach((w, i) => {
        const ph = ((t * 0.55 + i / waves.length) % 1);
        const rad = 8 + (1 - ph) * 56;
        let d = "";
        for (let a = -70; a <= 70; a += 7) {
          const q = P(PORT[0] + rad * Math.cos((a * Math.PI) / 180), PORT[1] + rad * Math.sin((a * Math.PI) / 180), PORT[2]);
          d += (d ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
        }
        w.setAttribute("d", d);
        w.setAttribute("opacity", (st.amp * Math.sin(ph * Math.PI) * 0.95).toFixed(2));
      });

      // bits along the bus
      bits.forEach((b, i) => {
        const f = (t * 0.45 + i / bits.length) % 1;
        const q = P(...along(BUS, f));
        b.setAttribute("transform", `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`);
        b.setAttribute("opacity", (on ? 0.9 * st.amp : 0).toFixed(2));
      });

      // the membrane bows with the pressure; the arrow under the port pulses with it
      const y0 = cy - r * 0.05, now = signal(t) * st.amp;
      membrane.setAttribute("d", `M${cx - r * 0.82} ${y0}Q${cx} ${(y0 - now * r * 0.55).toFixed(2)} ${cx + r * 0.82} ${y0}`);
      membrane.classList.toggle("hot", on);
      inArrow.setAttribute("d", `M${cx - r * 0.3} ${cy + r * 1.05}Q${cx} ${cy + r * 0.85} ${cx + r * 0.3} ${cy + r * 1.05}`);
      inArrow.setAttribute("opacity", (st.amp * (0.4 + 0.6 * Math.abs(now))).toFixed(2));

      // samples: the same signal, taken at fixed instants, newest at the right
      const step = (PX1 - PX0) / (NS - 1), A = MH * 0.3;
      const tNow = Math.floor(t / SAMPLE_DT) * SAMPLE_DT;
      let tr = "";
      for (let x = PX0; x <= PX1; x += 1.5) {
        const tt = t - ((PX1 - x) / step) * SAMPLE_DT;
        tr += (tr ? "L" : "M") + x.toFixed(1) + " " + (PY - signal(tt) * A * st.amp).toFixed(1);
      }
      trace.setAttribute("d", tr);
      let bitStr = "";
      stems.forEach((ln, i) => {
        const ts = tNow - (NS - 1 - i) * SAMPLE_DT;
        const x = PX1 - (t - ts) / SAMPLE_DT * step;
        const v = signal(ts) * st.amp;
        const y = PY - v * A;
        ln.setAttribute("x1", x.toFixed(1));
        ln.setAttribute("x2", x.toFixed(1));
        ln.setAttribute("y2", y.toFixed(1));
        ln.classList.toggle("hot", on);
        dots[i].setAttribute("cx", x.toFixed(1));
        dots[i].setAttribute("cy", y.toFixed(1));
        dots[i].classList.toggle("hot", on);
        if (i === NS - 1) bitStr = (Math.round(v * 0x7fffff) & 0xffffff).toString(2).padStart(24, "0").replace(/(.{4})(?=.)/g, "$1 ");
      });
      bitsLine.textContent = fmt(T.word, { bits: bitStr });

      if (st.on) st.count += 44100 * dt;
      api.readout(st.on ? fmt(T.on, { n: num(Math.floor(st.count)) }) : T.off);
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (toggle(), true) : false),
      unmount: () => stage.removeEventListener("click", toggle),
    };
  },
};

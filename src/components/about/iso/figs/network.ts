// Fig 7 · Στο δίκτυο. A shop with the sensor over its awning, the shop's
// Wi-Fi router on the roof, the neighbourhood's street cabinet, and the data
// centre at the back. Every few seconds the sensor blinks, its line of
// integers hops over Wi-Fi to the router, runs down the wall, through the
// cabinet and along the street, and lands at the server. Click to send now.

import { aboutStrings } from "@/lib/strings/about";
import { along, fmt, num, smooth, clamp, type Pt3 } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.network;

const PZ = 8;
const SHOP = { x: 20, y: 112, w: 100, d: 70, h: 52 };
const SENS: Pt3 = [103, SHOP.y + SHOP.d + 8, PZ + 38];
const ROUTER = { x: 56, y: 132, z: PZ + SHOP.h };
const DC = { x: 230, y: 18, w: 132, d: 82, h: 64 };
const CAB = { x: 168, y: 128, w: 26, d: 16, h: 34 };
const PERIOD = 4.4;

export const network: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame([[0, 0, 0], [380, 0, 0], [0, 230, 0], [380, 230, 0], [DC.x, DC.y, DC.h + PZ + 20], [DC.x + DC.w, DC.y + DC.d, DC.h + PZ], [ROUTER.x, ROUTER.y, ROUTER.z + 26]], 0.05);
    const { P, TOP, FRONT, SIDE, box, cyl, path, pt } = K;
    const slits = api.iso.slits, esc = api.iso.esc;
    let s = "";

    // ---------- plate, a street, sidewalks ----------
    s += box(0, 0, 0, 380, 230, PZ, 12);
    let dash = "";
    for (let x = 6; x < 372; x += 18) dash += `<line class="lane" x1="${x}" y1="${206}" x2="${x + 9}" y2="${206}"/>`;
    s += `<g transform="${TOP(0, 0, PZ)}">
      <rect class="face recess" x="0" y="192" width="380" height="30"/>${dash}
      <line class="curb" x1="0" y1="192" x2="380" y2="192"/>
      <rect class="detail" x="8" y="6" width="364" height="180" rx="6" opacity=".5"/>
    </g>`;

    // ---------- the cable: router → roof edge → down the wall → cabinet → data centre ----------
    const CABLE: Pt3[] = [
      [ROUTER.x + 8, ROUTER.y + 6, ROUTER.z],
      [SHOP.x + SHOP.w, ROUTER.y + 6, ROUTER.z],
      [SHOP.x + SHOP.w + 0.5, ROUTER.y + 6, PZ],
      [CAB.x, ROUTER.y + 6, PZ],
      [CAB.x + CAB.w, ROUTER.y + 6, PZ],
      [300, ROUTER.y + 6, PZ],
      [300, DC.y + DC.d + 0.5, PZ],
    ];
    s += `<path id="nw-cable" class="wire" d="${path(CABLE)}"/>`;

    // ---------- the data centre ----------
    s += box(DC.x, DC.y, PZ, DC.w, DC.d, DC.h, 0);
    let louvres = "";
    for (let k = 0; k < 4; k++) louvres += `<rect class="face recess" x="${8 + k * 30}" y="10" width="24" height="30"/>${slits(13, 37, 3, 8 + k * 30 + 2, 8 + k * 30 + 22, false)}`;
    s += `<g transform="${FRONT(DC.x, DC.y + DC.d, PZ + DC.h)}">${louvres}
      <rect class="face recess" x="60" y="44" width="14" height="20"/><line class="detail" x1="67" y1="44" x2="67" y2="64"/>
      <rect id="nw-strip" class="glass" x="84" y="47" width="40" height="3" rx="1.5"/>
      <text class="label" x="84" y="58" font-size="4.6">${esc(T.server)}</text>
    </g>`;
    s += `<g transform="${SIDE(DC.x + DC.w, DC.y + DC.d, PZ + DC.h)}">${[8, 38].map((u) => `<rect class="face recess" x="${u}" y="10" width="26" height="30"/>${slits(13, 37, 3, u + 2, u + 24, false)}`).join("")}</g>`;
    s += `<g transform="${TOP(DC.x, DC.y, PZ + DC.h)}"><rect class="detail" x="3" y="3" width="${DC.w - 6}" height="${DC.d - 6}"/></g>`;
    for (const [fx, fy] of [[258, 40], [292, 40], [326, 40], [258, 70], [292, 70]]) {
      s += box(fx - 12, fy - 11, PZ + DC.h, 24, 22, 6, 2);
      s += `<g transform="${TOP(fx - 12, fy - 11, PZ + DC.h + 6)}"><circle class="face recess" cx="12" cy="11" r="8"/><g class="fan" data-c="${fx},${fy}"><path class="detail" d="M12 3 L12 19 M4 11 L20 11 M6.3 5.3 L17.7 16.7 M17.7 5.3 L6.3 16.7"/></g></g>`;
    }

    // ---------- the street cabinet ----------
    s += box(CAB.x, CAB.y, PZ, CAB.w, CAB.d, CAB.h, 2);
    s += `<g transform="${FRONT(CAB.x, CAB.y + CAB.d, PZ + CAB.h)}"><line class="detail" x1="${CAB.w / 2}" y1="3" x2="${CAB.w / 2}" y2="${CAB.h - 3}"/>${slits(6, 12, 2, 4, 10, false)}<circle class="face" cx="${CAB.w / 2 - 2}" cy="${CAB.h / 2}" r="0.9"/><circle class="face" cx="${CAB.w / 2 + 2}" cy="${CAB.h / 2}" r="0.9"/></g>`;
    s += `<g transform="${SIDE(CAB.x + CAB.w, CAB.y + CAB.d, PZ + CAB.h)}"><text class="label" x="2" y="${CAB.h - 4}" font-size="4">${esc(T.cabinet)}</text></g>`;
    s += box(CAB.x - 2, CAB.y - 2, PZ + CAB.h, CAB.w + 4, CAB.d + 4, 2, 1);

    // ---------- the shop: roof, router, facade, awning, sensor ----------
    s += box(SHOP.x, SHOP.y, PZ, SHOP.w, SHOP.d, SHOP.h, 0);
    s += `<g transform="${TOP(SHOP.x, SHOP.y, PZ + SHOP.h)}"><rect class="detail" x="3" y="3" width="${SHOP.w - 6}" height="${SHOP.d - 6}"/></g>`;
    s += box(ROUTER.x, ROUTER.y, ROUTER.z, 16, 12, 5, 1);
    s += `<path class="mast" d="M${pt(ROUTER.x + 3, ROUTER.y + 2, ROUTER.z + 5)}L${pt(ROUTER.x + 1, ROUTER.y + 2, ROUTER.z + 19)}M${pt(ROUTER.x + 13, ROUTER.y + 2, ROUTER.z + 5)}L${pt(ROUTER.x + 15, ROUTER.y + 2, ROUTER.z + 19)}"/>`;
    s += `<g transform="${FRONT(ROUTER.x, ROUTER.y + 12, ROUTER.z + 5)}"><circle id="nw-rled" class="led" cx="12" cy="2.5" r="1.2"/></g>`;
    s += `<g transform="${FRONT(SHOP.x, SHOP.y + SHOP.d, PZ + SHOP.h)}">
      ${[8, 38, 68].map((u) => `<rect class="face recess" x="${u}" y="5" width="22" height="13"/>${slits(u + 2, u + 20, 2, 6, 17)}`).join("")}
      <rect class="glass" x="6" y="28" width="88" height="22"/>${slits(28, 72, 22, 28, 50)}
      <rect class="face recess" x="42" y="31" width="14" height="19"/>
    </g>`;
    s += `<g transform="${SIDE(SHOP.x + SHOP.w, SHOP.y + SHOP.d, PZ + SHOP.h)}">${[10, 40].map((u) => `<rect class="face recess" x="${u}" y="6" width="18" height="14"/>`).join("")}</g>`;
    s += box(SHOP.x + 2, SHOP.y + SHOP.d, PZ + 24, SHOP.w - 4, 10, 2.5, 0);
    s += `<g transform="${TOP(SHOP.x + 2, SHOP.y + SHOP.d, PZ + 26.5)}">${slits(6, SHOP.w - 8, 8, 1, 9)}</g>`;
    s += box(SENS[0] - 7, SHOP.y + SHOP.d, PZ + 30, 14, 8, 14, 2);
    s += `<g transform="${FRONT(SENS[0] - 7, SHOP.y + SHOP.d + 8, PZ + 44)}"><circle id="nw-halo" class="halo" cx="10" cy="8" r="7" filter="url(#iso-bloom)"/><circle id="nw-led" class="led" cx="10" cy="8" r="2" filter="url(#iso-soft)"/>${slits(2.5, 6.5, 1.4, 4, 10)}</g>`;
    {
      const a = P(SENS[0] - 7, SENS[1], SENS[2] + 4), b: [number, number] = [a[0] - 24, a[1] + 26];
      s += `<path class="leader" d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}h-6"/><text class="cap" x="${(b[0] - 9).toFixed(1)}" y="${(b[1] + 2.5).toFixed(1)}" text-anchor="end">${esc(T.sensor)}</text>`;
    }

    // ---------- a tree and a lamp on the near sidewalk ----------
    s += cyl(150, 186, PZ, 1.3, 58) + `<path class="mast" d="M${pt(150, 186, PZ + 58)}L${pt(150, 200, PZ + 61)}"/>` + box(146, 198, PZ + 58, 8, 7, 3, 1);
    {
      const c = P(220, 178, PZ + 30);
      s += `<path class="mast" d="M${pt(220, 178, PZ)}L${pt(220, 178, PZ + 24)}"/>`;
      s += [[-6, 2, 7], [6, 1, 7.5], [0, -6, 8], [-3, 5, 6.5], [4, 6, 6]].map(([dx, dy, rr]) => `<circle class="face" cx="${(c[0] + dx).toFixed(1)}" cy="${(c[1] + dy).toFixed(1)}" r="${rr}"/>`).join("");
    }

    // ---------- the Wi-Fi hop and the packet ----------
    const sp = P(...SENS), rp = P(ROUTER.x + 8, ROUTER.y + 6, ROUTER.z + 8);
    const midX = (sp[0] + rp[0]) / 2 - 10, midY = Math.min(sp[1], rp[1]) - 40;
    s += `<path id="nw-hop" class="hop" d="M${sp[0].toFixed(1)} ${sp[1].toFixed(1)}Q${midX.toFixed(1)} ${midY.toFixed(1)} ${rp[0].toFixed(1)} ${rp[1].toFixed(1)}"/>`;
    s += `<g id="nw-arcs">${[0, 1, 2].map(() => `<path class="ring" d="" opacity="0"/>`).join("")}</g>`;
    s += `<g id="nw-pkt" opacity="0">${K.boxc(-6, -4, 0, 12, 8, 3, 1, "bar")}</g>`;
    s += `<g id="nw-tip" opacity="0"><rect class="plate" x="0" y="-11" width="148" height="14" rx="3"/><text class="tag" x="5" y="-1.6">${esc(T.packet)}</text></g>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- live ----------
    const led = $(stage, "#nw-led"), halo = $(stage, "#nw-halo"), rled = $(stage, "#nw-rled"), strip = $(stage, "#nw-strip");
    const hop = $(stage, "#nw-hop"), arcs = $$(stage, "#nw-arcs path"), pkt = $(stage, "#nw-pkt"), tip = $(stage, "#nw-tip"), cable = $(stage, "#nw-cable");
    const fans = $$(stage, ".fan");
    const st = { t0: 0.4, n: 1, sent: 0 };
    let clock = 0;
    const send = () => {
      if (clock - st.t0 > 1.2) {
        st.t0 = clock;
        st.n++;
      }
    };
    stage.addEventListener("click", send);
    const hopLen = (hop as SVGPathElement).getTotalLength();
    const o = P(0, 0, 0);

    api.loop((t) => {
      clock = t;
      if (t - st.t0 > PERIOD) {
        st.t0 = t;
        st.n++;
      }
      const e = t - st.t0;
      // phases: blink + Wi-Fi (0–0.9), cable (0.9–3.0), arrival (3.0–3.8)
      const blink = e < 0.6;
      led.classList.toggle("hot", blink);
      halo.classList.toggle("hot", blink);
      arcs.forEach((a, i) => {
        const f = clamp((e - i * 0.12) / 0.8);
        const rad = 6 + f * 26;
        a.setAttribute("d", `M${(sp[0] - rad * 0.9).toFixed(1)} ${(sp[1] - rad * 0.45).toFixed(1)}A${rad.toFixed(1)} ${rad.toFixed(1)} 0 0 1 ${(sp[0] + rad * 0.2).toFixed(1)} ${(sp[1] - rad * 0.98).toFixed(1)}`);
        a.setAttribute("opacity", (f > 0 && f < 1 ? Math.sin(f * Math.PI) : 0).toFixed(2));
      });
      let pos: [number, number] | null = null;
      if (e >= 0.15 && e < 0.9) {
        const f = smooth(0.15, 0.9, e);
        const q = (hop as SVGPathElement).getPointAtLength(f * hopLen);
        pos = [q.x, q.y];
      } else if (e >= 0.9 && e < 3.0) {
        const q = P(...along(CABLE, smooth(0.9, 3.0, e)));
        pos = [q[0], q[1] - 2];
      }
      hop.classList.toggle("hot", e >= 0.1 && e < 0.95);
      cable.classList.toggle("hot", e >= 0.85 && e < 3.1);
      rled.classList.toggle("hot", e > 0.8 && e < 1.3);
      const arrived = e >= 3.0 && e < 3.9;
      strip.classList.toggle("hot", arrived);
      if (pos) {
        pkt.setAttribute("transform", `translate(${(pos[0] - o[0]).toFixed(1)} ${(pos[1] - o[1]).toFixed(1)})`);
        pkt.setAttribute("opacity", "1");
        tip.setAttribute("transform", `translate(${(pos[0] - 74).toFixed(1)} ${(pos[1] - 16).toFixed(1)})`);
        tip.setAttribute("opacity", "1");
      } else {
        pkt.setAttribute("opacity", "0");
        tip.setAttribute("opacity", "0");
      }
      fans.forEach((f, i) => f.setAttribute("transform", `rotate(${((t * 120 + i * 40) % 360).toFixed(1)} 12 11)`));
      api.power(e < 3.9);
      api.readout(fmt(e < 0.9 ? T.sending : e < 3.0 ? T.travel : T.arrived, { n: num(st.n) }));
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (send(), true) : false),
      unmount: () => stage.removeEventListener("click", send),
    };
  },
};

// Fig 1 · Ο ήχος είναι πίεση. An Athens street: a polykatoikia with
// balconies, a shop with the sensor over its awning, a kiosk across the road.
// A motorbike rides past; every few hundredths of a second its engine sends
// out a ring of pressure from wherever it is, so the rings bunch up ahead of
// it (Doppler). Where a ring reaches the sensor, the sensor's LED answers.
// Top left, a slice of the air in between: particles bunch and spread as the
// wave passes, and the pressure curve under them is the same wave.

import { aboutStrings } from "@/lib/strings/about";
import { clamp, smooth, type Pt3 } from "../kernel";
import { $, $$, type IsoFig } from "../runtime";

const T = aboutStrings.how.figures.pressure;

// world plan (x along the street, y toward the viewer, z up)
const PZ = 8;
const ROAD = [66, 152];
const LANE_FAR = 117, LANE_NEAR = 125; // the lane the bike rides in
const SENSOR = { x: 206, y: 48, z: PZ + 36, w: 16, d: 8, h: 16 };
// Sound outruns the bike: in a street it is about 25 times faster (343 m/s
// against ~14 m/s). Here it is about 6 times, so the rings still read, and
// the Doppler bunching ahead of the bike stays mild rather than cartoonish.
const SPEED = 40; // street units per second
const SOUND = 230; // ring growth, street units per second
const R_MAX = 175;
// Level at the sensor, in dB relative to the bike at its closest. A point
// source loses 20·log₁₀ of the distance ratio: 6 dB every time the distance
// doubles. The street's own background sits below it.
const L_BG = -16;

export const pressure: IsoFig = {
  mount(stage, api) {
    const K = api.iso.frame(
      [[0, 0, 0], [270, 0, 0], [0, 230, 0], [270, 230, 0], [6, 4, PZ + 128], [240, 8, PZ + 72], [-30, 260, 170]],
      0.035
    );
    const { P, D, TOP, FRONT, SIDE, box, cyl, hull, ringF, pt } = K;
    const slits = api.iso.slits;
    let s = "";

    // ---------- plate: sidewalks, road, crossing ----------
    s += box(0, 0, 0, 270, 230, PZ, 12);
    let paving = "";
    for (let x = 10; x < 268; x += 12) paving += `<line class="detail" x1="${x}" y1="50" x2="${x}" y2="${ROAD[0] - 2}"/>`;
    for (let y = 166; y < 226; y += 14) paving += `<line class="detail" x1="6" y1="${y}" x2="264" y2="${y}"/>`;
    let dashes = "";
    for (let x = 4; x < 266; x += 20) dashes += `<line class="lane" x1="${x}" y1="109" x2="${x + 10}" y2="109"/>`;
    let zebra = "";
    for (let i = 0; i < 6; i++) zebra += `<rect class="zebra" x="${150 + i * 6}" y="${ROAD[0] + 3}" width="3.2" height="${ROAD[1] - ROAD[0] - 6}"/>`;
    s += `<g transform="${TOP(0, 0, PZ)}">
      <rect class="face recess" x="0" y="${ROAD[0]}" width="270" height="${ROAD[1] - ROAD[0]}"/>
      <line class="curb" x1="0" y1="${ROAD[0]}" x2="270" y2="${ROAD[0]}"/>
      <line class="curb" x1="0" y1="${ROAD[1]}" x2="270" y2="${ROAD[1]}"/>
      ${paving}${dashes}${zebra}
      <rect class="detail" x="8" y="6" width="254" height="218" rx="6" opacity=".5"/>
    </g>`;

    // ---------- pressure rings on the ground (under everything that stands) ----------
    s += `<g transform="${TOP(0, 0, PZ)}" id="pr-rings">`;
    for (let i = 0; i < 14; i++) s += `<circle class="ring" r="0" opacity="0"/>`;
    s += `</g>`;

    // ---------- polykatoikia: shop floor + five floors of balconies ----------
    const B = { x: 6, y: 4, w: 112, d: 44 }, GF = 18, FH = 20, NF = 5;
    const top = PZ + GF + NF * FH;
    s += box(B.x, B.y, PZ, B.w, B.d, top - PZ, 0);
    // ground floor: shop window, entrance, a second window
    s += `<g transform="${FRONT(B.x, B.y + B.d, PZ + GF)}">
      <rect class="glass" x="6" y="4" width="42" height="14"/>${slits(16.5, 37.5, 10.5, 4, 18)}
      <rect class="face recess" x="54" y="3" width="14" height="15"/><line class="detail" x1="61" y1="3" x2="61" y2="18"/>
      <rect class="glass" x="74" y="4" width="32" height="14"/>${slits(84.7, 95.4, 10.7, 4, 18)}
      <line class="detail" x1="0" y1="1.5" x2="${B.w}" y2="1.5"/>
    </g>`;
    // upper floors: balcony doors with louvred shutters, half-open on some
    for (let f = 0; f < NF; f++) {
      const zb = PZ + GF + f * FH;
      let w = "";
      [8, 34, 60, 86].forEach((u, i) => {
        const open = (f + i) % 3 === 0;
        w += `<rect class="face recess" x="${u}" y="3" width="18" height="${FH - 4}"/>`;
        if (!open) w += slits(u + 1.5, u + 16.5, 1.5, 3.6, FH - 1.6);
        else w += `<rect class="face" x="${u}" y="3" width="6" height="${FH - 4}"/>${slits(u + 1, u + 5, 1.3, 3.6, FH - 1.6)}`;
      });
      s += `<g transform="${FRONT(B.x, B.y + B.d, zb + FH)}">${w}</g>`;
    }
    // side windows above the shop next door
    for (let f = 2; f < NF; f++) {
      const zb = PZ + GF + f * FH;
      s += `<g transform="${SIDE(B.x + B.w, B.y + B.d, zb + FH)}"><rect class="face recess" x="8" y="4" width="10" height="11"/><rect class="face recess" x="26" y="4" width="10" height="11"/></g>`;
    }
    // balconies: slab + railing, bottom to top
    for (let f = 0; f < NF; f++) {
      const zb = PZ + GF + f * FH;
      s += box(B.x - 2, B.y + B.d, zb, B.w + 4, 8, 1.6, 0);
      s += `<g transform="${FRONT(B.x - 2, B.y + B.d + 8, zb + 9)}"><line class="rail" x1="0" y1="0" x2="${B.w + 4}" y2="0"/>${slits(2, B.w + 2, 3, 0.6, 7.4)}</g>`;
      s += `<g transform="${SIDE(B.x + B.w + 2, B.y + B.d + 8, zb + 9)}"><line class="rail" x1="0" y1="0" x2="8" y2="0"/>${slits(2, 7, 2.5, 0.6, 7.4)}</g>`;
    }
    // roof: parapet line, water tank, solar water heater, antenna
    s += `<g transform="${TOP(B.x, B.y, top)}"><rect class="detail" x="3" y="3" width="${B.w - 6}" height="${B.d - 6}"/></g>`;
    s += cyl(26, 20, top, 6, 10);
    {
      const sx = 54, sy = 30, sz = top;
      s += box(sx, sy - 2, sz, 30, 4, 7, 0); // frame
      s += `<g transform="${K.plane([sx, sy + 6, sz + 2], [1, 0, 0], [0, -0.55, 0.84])}"><rect class="face" width="30" height="20"/>${slits(3, 27, 3, 2, 18)}</g>`;
      // the tank, lying along x behind the panel
      const tank: Pt3[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        tank.push([sx, 16 + 5 * Math.cos(a), sz + 22 + 5 * Math.sin(a)], [sx + 30, 16 + 5 * Math.cos(a), sz + 22 + 5 * Math.sin(a)]);
      }
      s += `<path class="face" d="${hull(tank)}"/><g transform="${SIDE(sx + 30, 16, sz + 22)}"><circle class="face top" r="5"/></g>`;
    }
    s += `<path class="mast" d="M${pt(100, 14, top)}L${pt(100, 14, top + 22)}M${pt(94, 14, top + 18)}L${pt(106, 14, top + 18)}M${pt(96, 14, top + 13)}L${pt(104, 14, top + 13)}"/>`;

    // ---------- the shop with the sensor ----------
    const Sh = { x: 124, y: 8, w: 116, d: 40, h: 66 };
    s += box(Sh.x, Sh.y, PZ, Sh.w, Sh.d, Sh.h, 0);
    s += `<g transform="${FRONT(Sh.x, Sh.y + Sh.d, PZ + 26)}">
      <rect class="glass" x="6" y="4" width="104" height="22"/>${slits(26, 90, 16, 4, 26)}
      <rect class="face recess" x="46" y="6" width="16" height="20"/><line class="detail" x1="54" y1="6" x2="54" y2="26"/>
    </g>`;
    s += `<g transform="${FRONT(Sh.x, Sh.y + Sh.d, PZ + Sh.h)}">
      ${[12, 47, 82].map((u) => `<rect class="face recess" x="${u}" y="6" width="22" height="16"/>${slits(u + 2, u + 20, 2, 7, 21)}`).join("")}
      <line class="detail" x1="0" y1="27" x2="${Sh.w}" y2="27"/>
    </g>`;
    s += `<g transform="${SIDE(Sh.x + Sh.w, Sh.y + Sh.d, PZ + Sh.h)}">${[6, 22].map((u) => `<rect class="face recess" x="${u}" y="8" width="10" height="14"/>`).join("")}</g>`;
    s += `<g transform="${TOP(Sh.x, Sh.y, PZ + Sh.h)}"><rect class="detail" x="3" y="3" width="${Sh.w - 6}" height="${Sh.d - 6}"/></g>`;
    s += box(Sh.x + 14, Sh.y + 10, PZ + Sh.h, 18, 12, 8, 1) + `<g transform="${FRONT(Sh.x + 14, Sh.y + 22, PZ + Sh.h + 8)}">${slits(3, 15, 2, 2, 6)}</g>`;
    // awning, striped
    s += box(Sh.x + 2, Sh.y + Sh.d, PZ + 26, Sh.w - 4, 11, 2.5, 0);
    s += `<g transform="${TOP(Sh.x + 2, Sh.y + Sh.d, PZ + 28.5)}">${slits(8, Sh.w - 8, 8, 1, 10)}</g>`;
    // the sensor: cable down the wall, the box, its LED
    s += `<path class="wire" d="M${pt(SENSOR.x + 8, Sh.y + Sh.d + 0.5, SENSOR.z)}L${pt(SENSOR.x + 8, Sh.y + Sh.d + 0.5, PZ + 28.5)}"/>`;
    s += box(SENSOR.x, SENSOR.y, SENSOR.z, SENSOR.w, SENSOR.d, SENSOR.h, 2);
    s += `<g transform="${FRONT(SENSOR.x, SENSOR.y + SENSOR.d, SENSOR.z + SENSOR.h)}">
      ${slits(3, 9, 1.5, 3, 7)}
      <circle id="pr-halo" class="halo" cx="11.5" cy="10" r="7" filter="url(#iso-bloom)"/>
      <circle id="pr-led" class="led" cx="11.5" cy="10" r="2.1" filter="url(#iso-soft)"/>
    </g>`;
    // a street tree on the back sidewalk
    s += tree(100, 58, 30);

    // ---------- the motorbike: drawn in its own side plane, then moved ----------
    s += `<g id="pr-bike">${bike()}</g>`;
    s += `<g id="pr-puffs">${Array.from({ length: 7 }, () => `<circle class="puff" r="0" opacity="0"/>`).join("")}</g>`;

    // ---------- front sidewalk: bollards, lamp, trees, a kiosk ----------
    const front: [number, () => string][] = [];
    for (let x = 58; x <= 134; x += 19) front.push([x + 157, () => cyl(x, 157, PZ, 1.6, 9)]);
    front.push([150 + 162, () => lamp(150, 162)]);
    front.push([40 + 176, () => tree(40, 176, 34)]);
    front.push([116 + 182, () => tree(116, 182, 28)]);
    front.push([198 + 176, () => kiosk(186, 166)]);
    front.sort((a, b) => a[0] - b[0]).forEach(([, f]) => (s += f()));

    // ---------- overlay: the air in between, and labels ----------
    const AX = K.W * 0.035, AY = K.H * 0.05, AW = K.W * 0.36, AH = K.H * 0.27;
    const NP = 34, ROWS = 4;
    const sp = (AW - 24) / (NP - 1);
    let dots = "";
    for (let r = 0; r < ROWS; r++) for (let i = 0; i < NP; i++) dots += `<circle class="air" r="1.15" cx="${AX + 12 + i * sp}" cy="${AY + 22 + r * 7}"/>`;
    const leadTo = P(176, 70, PZ + 24);
    s += `<g id="pr-inset">
      <path class="leader" d="M${(AX + AW * 0.8).toFixed(1)} ${(AY + AH).toFixed(1)}L${leadTo[0].toFixed(1)} ${leadTo[1].toFixed(1)}"/>
      <circle class="leader-dot" cx="${leadTo[0].toFixed(1)}" cy="${leadTo[1].toFixed(1)}" r="2"/>
      <rect class="plate" x="${AX}" y="${AY}" width="${AW}" height="${AH}" rx="6"/>
      <text class="cap" x="${AX + 10}" y="${AY + 12}">${api.iso.esc(T.air)}</text>
      <text class="tag" id="pr-dense" x="0" y="${AY + 22 + ROWS * 7 + 3}" text-anchor="middle">${api.iso.esc(T.dense)}</text>
      <text class="tag" id="pr-sparse" x="0" y="${AY + 22 + ROWS * 7 + 3}" text-anchor="middle">${api.iso.esc(T.sparse)}</text>
      ${dots}
      <line class="detail" x1="${AX + 10}" y1="${AY + AH - 18}" x2="${AX + AW - 10}" y2="${AY + AH - 18}"/>
      <text class="cap" x="${AX + 10}" y="${AY + AH - 26}">${api.iso.esc(T.pressure)}</text>
      <path id="pr-curve" class="curve" d=""/>
    </g>`;
    // the sensor's own view: its level over the last few seconds, newest on the right
    const MX = K.W * 0.69, MY = K.H * 0.06, MW = K.W * 0.28, MH = K.H * 0.17;
    const ledP = P(SENSOR.x + 11.5, SENSOR.y + SENSOR.d, SENSOR.z + 6);
    s += `<path class="leader" d="M${(MX + MW * 0.35).toFixed(1)} ${(MY + MH).toFixed(1)}L${ledP[0].toFixed(1)} ${ledP[1].toFixed(1)}"/>
      <rect class="plate" x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="6"/>
      <text class="cap" x="${MX + 8}" y="${MY + 11}">${api.iso.esc(T.level)}</text>
      <line class="detail" x1="${MX + 8}" y1="${MY + MH - 9}" x2="${MX + MW - 18}" y2="${MY + MH - 9}"/>
      <path id="pr-trace" class="curve hot" d=""/>
      <rect class="detail" x="${MX + MW - 13}" y="${MY + 17}" width="5" height="${MH - 26}"/>
      <rect id="pr-meter" class="bar" x="${MX + MW - 13}" y="${MY + MH - 9}" width="5" height="0"/>
      <text class="tag" x="${MX + 8}" y="${MY + MH - 2}">${api.iso.esc(T.levelNote)}</text>`;

    stage.setAttribute("viewBox", K.viewBox);
    stage.innerHTML = s;

    // ---------- helpers that draw ----------
    function tree(x: number, y: number, h: number) {
      let o = `<g transform="${TOP(x - 5, y - 5, PZ)}"><rect class="face recess" width="10" height="10"/>${slits(2, 8, 2, 1, 9)}</g>`;
      o += `<path class="mast" d="M${pt(x, y, PZ)}L${pt(x, y, PZ + h - 6)}"/>`;
      // canopy: a cloud of overlapping leaf clusters, back ones first
      const c = P(x, y, PZ + h);
      const blobs: [number, number, number][] = [[-6, 2, 7], [6, 1, 7.5], [0, -6, 8], [-3, 5, 6.5], [4, 6, 6]];
      o += blobs
        .map(([dx, dy, r]) => `<circle class="face" cx="${(c[0] + dx).toFixed(1)}" cy="${(c[1] + dy).toFixed(1)}" r="${r}"/>`)
        .join("");
      o += blobs
        .map(([dx, dy, r]) => `<path class="detail" d="M${(c[0] + dx - r * 0.5).toFixed(1)} ${(c[1] + dy + r * 0.1).toFixed(1)}q${(r * 0.5).toFixed(1)} ${(-r * 0.45).toFixed(1)} ${r.toFixed(1)} 0"/>`)
        .join("");
      return o;
    }
    function lamp(x: number, y: number) {
      return cyl(x, y, PZ, 1.4, 66) + `<path class="mast" d="M${pt(x, y, PZ + 66)}L${pt(x, y - 16, PZ + 70)}"/>` + box(x - 4, y - 22, PZ + 66, 8, 7, 3, 1);
    }
    function kiosk(x: number, y: number) {
      let o = box(x, y, PZ, 28, 22, 24, 2);
      o += `<g transform="${FRONT(x, y + 22, PZ + 24)}"><rect class="glass" x="3" y="4" width="22" height="11"/>${slits(6, 22, 4, 4, 15)}<rect class="face recess" x="3" y="17" width="22" height="5"/></g>`;
      o += `<g transform="${SIDE(x + 28, y + 22, PZ + 24)}">${slits(3, 19, 2, 4, 20, true)}</g>`;
      o += box(x - 4, y - 4, PZ + 24, 36, 30, 3, 1);
      o += box(x + 32, y + 6, PZ, 10, 8, 15, 1) + `<g transform="${FRONT(x + 32, y + 14, PZ + 15)}"><rect class="glass" x="1.5" y="2" width="7" height="11"/></g>`;
      return o;
    }
    function bike() {
      // Side profile in plane units: u along +x, v down, ground at v = 0.
      // The near side (+y) is the rider's left; volumes are hulls of the
      // same outline at two depths, so the bike has body without boxes.
      const R = 8.5, W1: [number, number] = [10, -R], W2: [number, number] = [44, -R];
      const WM = (LANE_FAR + LANE_NEAR) / 2;
      const P2 = (pts: [number, number][]) => "M" + pts.map(([u, v]) => `${u} ${v}`).join("L") + "Z";
      const tankPts: [number, number][] = [[20, -22.5], [22, -27], [26, -29.6], [31, -29.8], [35.4, -27.6], [37.6, -25.2], [35.6, -21], [21, -21]];
      const seatPts: [number, number][] = [[7, -23.6], [12, -24.4], [17, -24], [21.4, -22.8], [22, -21], [8, -20.6]];
      const tailPts: [number, number][] = [[0.4, -22.6], [3, -24.6], [8, -23.8], [8.8, -20.8], [4, -20.4], [1, -20.8]];
      const engPts: [number, number][] = [[19.6, -20.6], [33.4, -20.6], [34.6, -18], [33.6, -11.6], [30.6, -9.6], [21, -9.6], [18.6, -12.6]];
      const torsoPts: [number, number][] = [[14.6, -22], [15.6, -27.5], [18.6, -33], [22.6, -37.2], [26, -38.2], [27.8, -36.4], [27, -33.6], [24.4, -29], [22.2, -24.4], [21.4, -21.4]];
      const legPts: [number, number][] = [[15, -23.8], [21, -24.6], [26.6, -24], [28.8, -22.4], [29.2, -20.6], [27.2, -12.8], [24.6, -12.6], [25.8, -20], [20, -20.2], [15, -20.6]];
      const armPts: [number, number][] = [[24.2, -35.8], [28, -33.8], [31.6, -32], [36.8, -31.2], [36.9, -29.5], [31.2, -29.6], [27.2, -30.8], [23, -32.8]];
      const at = (u: number, v: number, y: number): Pt3 => [u, y, PZ - v];
      const vol = (pts: [number, number][], half: number, cls = "face") =>
        `<path class="${cls}" d="${hull(pts.flatMap(([u, v]) => [at(u, v, WM - half), at(u, v, WM + half)]))}"/>`;
      const ball = (c: [number, number], r: number, half: number) =>
        `<path class="face" d="${hull([...ringF(c[0], WM - half, PZ - c[1], r, 28), ...ringF(c[0], WM + half, PZ - c[1], r, 28)])}"/>`;
      const tyre = (c: [number, number]) => hull([...ringF(c[0], WM - 1.7, PZ - c[1], R, 40), ...ringF(c[0], WM + 1.7, PZ - c[1], R, 40)]);
      const wheel = (c: [number, number], id: string) =>
        `<circle class="tyre" cx="${c[0]}" cy="${c[1]}" r="${R}"/><circle class="detail" cx="${c[0]}" cy="${c[1]}" r="${R - 1.8}"/>` +
        `<circle class="detail" cx="${c[0]}" cy="${c[1]}" r="${R - 2.6}"/><circle class="face" cx="${c[0]}" cy="${c[1]}" r="1.8"/>` +
        `<g id="${id}">${Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          const p = (r: number, da = 0) => `${(c[0] + r * Math.cos(a + da)).toFixed(2)} ${(c[1] + r * Math.sin(a + da)).toFixed(2)}`;
          return `<path class="detail" d="M${p(1.8, 0.2)}L${p(R - 2.6, 0.05)}L${p(R - 2.6, -0.05)}L${p(1.8, -0.2)}"/>`;
        }).join("")}<circle class="face top" cx="${c[0] + R - 0.9}" cy="${c[1]}" r="0.9"/></g>`;
      const fork = (y: number, cls: string) =>
        `<g transform="${FRONT(0, y, PZ)}"><path class="${cls}" d="M38.8 -28.4 L40.4 -28.8 L44.9 -8.4 L43.2 -8.1 Z"/><path class="${cls === "face" ? "rail" : "detail"}" d="M36 -30.4 L40.6 -31.9"/></g>`;
      const beam = `<g transform="${TOP(0, 0, PZ)}"><path id="pr-beam" class="halo" filter="url(#iso-bloom)" d="M46 ${WM - 3} L108 ${WM - 17} L108 ${WM + 11} Z"/></g>`;
      const near = `<g transform="${FRONT(0, WM + 4, PZ)}">
        <path class="face" d="M10 -9.8 Q 17 -12.6, 24.6 -14.6 L25.6 -12.2 Q 18 -10, 11 -7.4 Z"/>
        <path class="pipe" d="M24 -11 C 19 -6.6, 12 -6.4, 5.5 -7.4"/>
        <path class="face" d="M-2 -10.6 L10.6 -9 L10.6 -5.4 L-2 -6.6 Q -3 -8.6, -2 -10.6 Z"/>${slits(0.5, 8.5, 2, -9.6, -6.6)}
        <path class="face" d="${P2(engPts)}"/>${slits(21.5, 31.5, 2, -19, -11)}<circle class="detail" cx="26.6" cy="-14.6" r="2.4"/>
        <path class="face" d="${P2(tankPts)}"/><path class="detail" d="M23.6 -26.2 C 27 -27.6, 32 -27.6, 35 -25.4"/>
        <path class="face" d="${P2(tailPts)}"/><path class="face top" d="${P2(seatPts)}"/>
        <path class="rail" d="M0.6 -13.6 A 10.6 10.6 0 0 1 16.6 -17.6"/>
        <path class="rail" d="M37.4 -12.4 A 10.2 10.2 0 0 1 51 -11.4"/>
      </g>`;
      const rider = `<g transform="${FRONT(0, WM + 3, PZ)}">
        <path class="face" d="${P2(legPts)}"/>
        <path class="face top" d="M23.4 -13.6 L29.2 -13.6 Q 30 -12.2, 29.2 -10.9 L22.8 -10.9 Z"/>
        <path class="face" d="${P2(armPts)}"/><circle class="face" cx="37.2" cy="-30.3" r="1.2"/>
        <path class="detail" d="M18 -31 Q 21 -29, 22.4 -24"/>
      </g>`;
      const helmet = `<g transform="${FRONT(0, WM + 3.2, PZ)}">
        <circle class="face top" cx="25.6" cy="-42.6" r="4.7"/>
        <path class="glass" d="M27.4 -45 Q 30.4 -43.6, 30.2 -40.6 L27.6 -40.2 Q 28.6 -42.4, 27.4 -45 Z"/>
        <path class="detail" d="M21.6 -44.4 Q 24 -47.6, 28.4 -46.4"/>
      </g>`;
      return (
        beam +
        fork(WM - 4, "detail") +
        `<path class="tyre" d="${tyre(W1)}"/><path class="tyre" d="${tyre(W2)}"/>` +
        `<g transform="${FRONT(0, WM + 1.7, PZ)}">${wheel(W1, "pr-w1")}${wheel(W2, "pr-w2")}</g>` +
        vol(engPts, 3.4) +
        vol(tailPts, 2.6) +
        vol(seatPts, 3) +
        vol(tankPts, 4) +
        near +
        vol(torsoPts, 3.4) +
        ball([25.6, -42.6], 4.7, 2.6) +
        `<g transform="${FRONT(0, WM + 3.4, PZ)}"><path class="face" d="${P2(torsoPts)}"/></g>` +
        rider +
        helmet +
        fork(WM + 4, "face") +
        `<g transform="${FRONT(0, WM + 4, PZ)}"><circle id="pr-head" class="led" cx="42.4" cy="-24.6" r="2.4" filter="url(#iso-soft)"/><circle class="detail" cx="42.4" cy="-24.6" r="3.2"/></g>`
      );
    }

    // ---------- live ----------
    const bikeG = $(stage, "#pr-bike"), w1 = $(stage, "#pr-w1"), w2 = $(stage, "#pr-w2");
    const head = $(stage, "#pr-head"), beam = $(stage, "#pr-beam");
    const rings = $$<SVGCircleElement>(stage, "#pr-rings circle").map((el) => ({ el, x: 0, y: 0, t0: -99, arrived: true }));
    const puffs = $$<SVGCircleElement>(stage, "#pr-puffs circle").map((el) => ({ el, p: [0, 0, 0] as Pt3, t0: -99 }));
    const led = $(stage, "#pr-led"), halo = $(stage, "#pr-halo");
    const air = $$<SVGCircleElement>(stage, ".air"), curve = $(stage, "#pr-curve");
    const dense = $(stage, "#pr-dense"), sparse = $(stage, "#pr-sparse");
    const trace = $(stage, "#pr-trace"), meter = $(stage, "#pr-meter");
    const HIST = 150; // samples of history in the meter, one per 1/30 s
    const hist: number[] = new Array(HIST).fill(0);

    const st = { on: true, v: SPEED, bx: 28, spin: 0, lastRing: -1, lastPuff: -1, amp: 0, ri: 0, pi: 0, L: L_BG, arrD: 1e9, arrT: -9, lastSample: 0 };
    const toggle = () => {
      st.on = !st.on;
    };
    stage.addEventListener("click", toggle);

    // where sound is heard: the sensor's microphone, at its LED
    const S3: Pt3 = [SENSOR.x + 11.5, SENSOR.y + SENSOR.d, SENSOR.z + 6];
    const EZ = PZ + 12; // the engine's height
    const ringY = (LANE_FAR + LANE_NEAR) / 2;
    const D_MIN = Math.hypot(S3[1] - ringY, S3[2] - EZ); // closest approach
    const dist3 = (x: number) => Math.hypot(S3[0] - x, S3[1] - ringY, S3[2] - EZ);
    api.loop((t, dt) => {
      // ride: when switched off, coast to a stop somewhere it can be seen
      const target = st.on || st.bx < 30 || st.bx > 190 ? SPEED : 0;
      st.v += (target - st.v) * Math.min(1, dt * 2.4);
      st.bx += st.v * dt;
      if (st.bx > 270) st.bx = -46;
      st.spin += ((st.v * dt) / 8.5) * (180 / Math.PI);
      const d = D(st.bx, 0, 0);
      bikeG.setAttribute("transform", `translate(${d[0].toFixed(2)} ${d[1].toFixed(2)})`);
      bikeG.setAttribute("opacity", (smooth(-46, -6, st.bx) * (1 - smooth(214, 262, st.bx))).toFixed(3));
      w1.setAttribute("transform", `rotate(${st.spin.toFixed(1)} 10 -8.5)`);
      w2.setAttribute("transform", `rotate(${st.spin.toFixed(1)} 44 -8.5)`);
      head.classList.toggle("hot", st.on);
      beam.classList.toggle("hot", st.on);

      // engine: a ring every 0.16 s from the engine, and a puff from the exhaust
      const running = st.on && st.v > 15 && st.bx > -20 && st.bx < 236;
      if (running && t - st.lastRing > 0.16) {
        const r = rings[st.ri++ % rings.length];
        r.x = st.bx + 26;
        r.y = ringY;
        r.t0 = t;
        r.arrived = false;
        st.lastRing = t;
      }
      if (running && t - st.lastPuff > 0.22) {
        const p = puffs[st.pi++ % puffs.length];
        p.p = [st.bx - 2, LANE_NEAR - 2, PZ + 6];
        p.t0 = t;
        st.lastPuff = t;
      }
      for (const r of rings) {
        const rad = (t - r.t0) * SOUND;
        // a ring reaches the microphone once it has travelled the distance to it
        if (!r.arrived && r.t0 >= 0 && rad >= dist3(r.x)) {
          r.arrived = true;
          st.arrD = dist3(r.x);
          st.arrT = t;
        }
        if (rad > R_MAX || r.t0 < 0) {
          r.el.setAttribute("opacity", "0");
          continue;
        }
        // pressure amplitude falls as 1/distance
        const a = clamp(16 / (rad + 16)) * (1 - smooth(R_MAX * 0.7, R_MAX, rad));
        r.el.setAttribute("cx", r.x.toFixed(1));
        r.el.setAttribute("cy", r.y.toFixed(1));
        r.el.setAttribute("r", rad.toFixed(1));
        r.el.setAttribute("opacity", a.toFixed(3));
      }
      // the level at the sensor: set by the ring arriving now, i.e. by where
      // the bike WAS when it sent it — distance and delay both come for free
      const hearing = t - st.arrT < 0.3;
      const Lsrc = -20 * Math.log10(st.arrD / D_MIN);
      const Lnow = hearing ? 10 * Math.log10(Math.pow(10, Lsrc / 10) + Math.pow(10, L_BG / 10)) : L_BG;
      st.L += (Lnow - st.L) * Math.min(1, dt * 7);
      const lv = clamp((st.L - L_BG) / -L_BG); // 0 = background, 1 = bike at its closest
      led.classList.toggle("hot", lv > 0.06);
      led.setAttribute("opacity", (0.35 + 0.65 * lv).toFixed(2));
      halo.classList.toggle("hot", lv > 0.06);
      halo.setAttribute("opacity", (lv * 0.95).toFixed(2));
      // the meter's trace, one sample per 1/30 s
      while (t - st.lastSample >= 1 / 30) {
        st.lastSample += 1 / 30;
        hist.shift();
        hist.push(lv);
      }
      const tx0 = MX + 8, tx1 = MX + MW - 18, ty1 = MY + MH - 9, th = MH - 28;
      trace.setAttribute("d", "M" + hist.map((v, i) => `${(tx0 + (i / (HIST - 1)) * (tx1 - tx0)).toFixed(1)} ${(ty1 - v * th).toFixed(1)}`).join("L"));
      meter.setAttribute("y", (ty1 - lv * th).toFixed(1));
      meter.setAttribute("height", (lv * th).toFixed(1));
      for (const p of puffs) {
        const age = t - p.t0;
        if (age > 0.9 || p.t0 < 0) {
          p.el.setAttribute("opacity", "0");
          continue;
        }
        const q = P(p.p[0] - age * 4, p.p[1], p.p[2] + age * 7);
        p.el.setAttribute("cx", q[0].toFixed(1));
        p.el.setAttribute("cy", q[1].toFixed(1));
        p.el.setAttribute("r", (1 + age * 3).toFixed(2));
        p.el.setAttribute("opacity", (0.55 * (1 - age / 0.9)).toFixed(2));
      }

      // the air by the sensor: a longitudinal wave, ξ = A·sin(kx − ωt), pressure ∝ −∂ξ/∂x,
      // its amplitude the pressure there (10^(L/20)), so it swells as the bike nears
      st.amp = Math.pow(10, st.L / 20);
      const k = (Math.PI * 2) / (AW * 0.42), w = 5.2, A = 3.2 * st.amp;
      air.forEach((el, i) => {
        const x0 = AX + 12 + (i % NP) * sp;
        el.setAttribute("cx", (x0 + A * Math.sin(k * x0 - w * t)).toFixed(2));
      });
      let dp = "";
      for (let x = AX + 10; x <= AX + AW - 10; x += 2) {
        const y = AY + AH - 18 - 9 * st.amp * -Math.cos(k * x - w * t);
        dp += (dp ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      }
      curve.setAttribute("d", dp);
      curve.classList.toggle("hot", st.amp > 0.25);
      // follow the first compression and rarefaction inside the panel
      const lambda = (Math.PI * 2) / k, x0 = AX + AW * 0.3;
      const wrap = (x: number) => x0 + ((((x - x0) % lambda) + lambda) % lambda);
      dense.setAttribute("x", wrap((Math.PI + w * t) / k).toFixed(1));
      sparse.setAttribute("x", wrap((w * t) / k).toFixed(1));
      dense.setAttribute("opacity", clamp(st.amp * 1.6).toFixed(2));
      sparse.setAttribute("opacity", clamp(st.amp * 1.6).toFixed(2));

      api.power(st.on);
      api.readout(st.on ? T.on : T.off);
    });

    return {
      key: (e) => (e.key === " " || e.key === "Enter" ? (toggle(), true) : false),
      unmount: () => stage.removeEventListener("click", toggle),
    };
  },
};

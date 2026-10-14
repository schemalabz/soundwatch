// Renders every app icon from one mark: the map's ring with the wordmark's
// orange dot inside it, on Hat Black. Run after changing the mark:
//
//   npx tsx scripts/brand-icons.tsx
//
// Writes src/app/icon.svg (the browser tab, vector), src/app/favicon.ico
// (16/32/48 for everything that still asks for /favicon.ico),
// src/app/apple-icon.png (iOS home screen) and public/icons/* (the web app
// manifest, including a maskable one with the mark inside the safe zone).
// Next serves the src/app files by convention; nothing else references them.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ImageResponse } from "next/og";

const INK = "#0e0e1c"; // Hat Black
const SOUND = "#f68b24"; // McDuck Orange — sound, and nothing else

interface MarkOptions {
  /** Rounded tile (a tab, a launcher) or full bleed (iOS and maskable crop it themselves). */
  rounded: boolean;
  /** Share of the tile the ring spans, centred. */
  scale: number;
  /** Heavier ring and dot, for 16 and 32 px where a hairline vanishes. */
  heavy?: boolean;
}

/** The mark on a 64-unit grid. */
function markSvg({ rounded, scale, heavy = false }: MarkOptions): string {
  const ring = (heavy ? 17 : 18.75) * scale;
  const stroke = (heavy ? 6 : 4.25) * scale;
  const dot = (heavy ? 8.5 : 7.25) * scale;
  const corner = rounded ? 14 : 0;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="${corner}" fill="${INK}"/>`,
    `<circle cx="32" cy="32" r="${ring.toFixed(2)}" fill="none" stroke="${SOUND}" stroke-width="${stroke.toFixed(2)}"/>`,
    `<circle cx="32" cy="32" r="${dot.toFixed(2)}" fill="${SOUND}"/>`,
    `</svg>`,
  ].join("");
}

async function renderPng(svg: string, size: number): Promise<Buffer> {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const res = new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="" />,
    { width: size, height: size }
  );
  return Buffer.from(await res.arrayBuffer());
}

/** An .ico holding PNG images — read by every browser and by Windows since Vista. */
function packIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

function write(path: string, data: string | Buffer): void {
  const full = join(process.cwd(), path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  console.log(`wrote ${path} (${typeof data === "string" ? data.length : data.length} bytes)`);
}

async function main(): Promise<void> {
  const tab = markSvg({ rounded: true, scale: 1 });
  write("src/app/icon.svg", `${tab}\n`);

  write(
    "src/app/favicon.ico",
    packIco([
      { size: 16, png: await renderPng(markSvg({ rounded: true, scale: 1, heavy: true }), 16) },
      { size: 32, png: await renderPng(markSvg({ rounded: true, scale: 1, heavy: true }), 32) },
      { size: 48, png: await renderPng(tab, 48) },
    ])
  );

  write("src/app/apple-icon.png", await renderPng(markSvg({ rounded: false, scale: 0.86 }), 180));
  write("public/icons/icon-192.png", await renderPng(tab, 192));
  write("public/icons/icon-512.png", await renderPng(tab, 512));
  // Maskable: launchers crop to a circle or squircle; keep the ring inside
  // the 80 % safe zone.
  write("public/icons/icon-maskable-512.png", await renderPng(markSvg({ rounded: false, scale: 0.78 }), 512));
}

main();

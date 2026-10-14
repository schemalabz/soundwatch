import path from "node:path";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import QRCode from "qrcode";

// Device label, drawn at the printer's own resolution so nothing is rescaled
// after the fact: 8 dots/mm, reading orientation. The label's HEIGHT is the
// tape width (48 mm = 384 dots, what an MXW01-class printer burns per row);
// its width runs along the tape, so it is the only dimension that costs paper.
// The printer client rotates this 90° — lossless, because every pixel is
// already pure black or white. Layout approved on paper 2026-10-12; see the
// revision in docs/superpowers/specs/2026-08-04-device-labels-design.md.
export const LABEL_WIDTH = 272; // 34 mm of tape
export const LABEL_HEIGHT = 384; // 48 mm tape width
const QR_MODULE = 4; // dots per QR module — integer, so every module is the same size
const QR_QUIET = 4; // quiet zone, in modules
const MARGIN = 6;

export const INSTALL_BASE = "https://soundwatch.gr/install/";

export type LabelSensor = {
  deviceId: string;
  name: string | null;
  apName: string | null;
  hardwareId: string | null;
};

// Bundled, not system fonts: the Docker image has none worth trusting, and the
// label must come out the same on every host. next.config.ts traces this
// directory into the standalone build.
const FONT_DIR = path.join(process.cwd(), "src/lib/label/fonts");
let fontsReady = false;
function registerFont(file: string, family: string) {
  const fontPath = path.join(FONT_DIR, file);
  if (GlobalFonts.registerFromPath(fontPath, family) == null) {
    throw new Error(`label font missing: ${fontPath}`);
  }
}

function ensureFonts() {
  if (fontsReady) return;
  registerFont("DejaVuSans-Bold.ttf", "LabelSans");
  registerFont("DejaVuSansMono-Bold.ttf", "LabelMono");
  fontsReady = true;
}

type Line = { text: string; family: "LabelSans" | "LabelMono"; size: number; min: number; gap: number };

// Every line bold: at thermal sizes a regular-weight stroke is one dot wide
// and breaks up when thresholded — measured on paper, not theorised.
function labelLines(s: LabelSensor): Line[] {
  const lines: Line[] = [];
  // Friendly name first when there is one — with random 16-char tokens it is
  // the identity a human actually reads.
  if (s.name) lines.push({ text: s.name, family: "LabelSans", size: 24, min: 16, gap: 0 });
  lines.push(
    // URL prefix directly above the token, so the two read as one typed address.
    { text: INSTALL_BASE.replace("https://", ""), family: "LabelMono", size: 24, min: 16, gap: s.name ? 10 : 0 },
    // Token — the loudest text: support-call identity.
    { text: s.deviceId, family: "LabelMono", size: 32, min: 20, gap: 6 },
    // Setup AP — join the right box when several are on a table.
    { text: `WiFi: ${s.apName ?? "—"}`, family: "LabelSans", size: 26, min: 16, gap: 16 },
    // Hardware id tail — swapped-box tiebreaker, deliberately the quietest line.
    { text: `HW …${(s.hardwareId ?? "").slice(-6) || "?"}`, family: "LabelMono", size: 22, min: 16, gap: 12 },
  );
  return lines;
}

// Largest size <= line.size whose text fits the width; below line.min the
// text is ellipsized instead, so a long friendly name cannot push the token off.
function fit(ctx: SKRSContext2D, line: Line): { text: string; size: number } {
  const room = LABEL_WIDTH - 2 * MARGIN;
  for (let size = line.size; size >= line.min; size--) {
    ctx.font = `${size}px ${line.family}`;
    if (ctx.measureText(line.text).width <= room) return { text: line.text, size };
  }
  ctx.font = `${line.min}px ${line.family}`;
  let text = line.text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > room) text = text.slice(0, -1);
  return { text: `${text}…`, size: line.min };
}

export async function renderLabel(sensor: LabelSensor): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(LABEL_WIDTH, LABEL_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  const qr = QRCode.create(`${INSTALL_BASE}${sensor.deviceId}`, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const qrSize = (n + 2 * QR_QUIET) * QR_MODULE;
  const lines = labelLines(sensor).map((l) => ({ ...l, ...fit(ctx, l) }));
  const textHeight = lines.reduce((h, l) => h + l.gap + l.size, 0);
  const total = qrSize + textHeight;
  if (total > LABEL_HEIGHT) throw new Error(`label content ${total} dots exceeds tape width ${LABEL_HEIGHT}`);

  // Centre the whole block across the tape.
  let y = Math.floor((LABEL_HEIGHT - total) / 2);
  const qrX = Math.floor((LABEL_WIDTH - qrSize) / 2);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        ctx.fillRect(qrX + (c + QR_QUIET) * QR_MODULE, y + (r + QR_QUIET) * QR_MODULE, QR_MODULE, QR_MODULE);
  y += qrSize;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const l of lines) {
    y += l.gap;
    ctx.font = `${l.size}px ${l.family}`;
    ctx.fillText(l.text, LABEL_WIDTH / 2, y);
    y += l.size;
  }

  // Pure black on white: thermal heads cannot do grey, and antialiased edges
  // left for the printer to dither are what made thin text break up.
  const img = ctx.getImageData(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 128 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.encode("png");
}

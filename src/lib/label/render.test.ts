import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { INSTALL_BASE, LABEL_HEIGHT, LABEL_WIDTH, renderLabel, type LabelSensor } from "./render";

const PLAIN: LabelSensor = {
  deviceId: "z57ksukdg7hp9td6",
  name: null,
  apName: "Soundwatch-0604",
  hardwareId: "6A2A71F50305247522E3120FF0D0226",
};

async function pixels(png: Buffer) {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
}

// The label's anatomy, read back from the raster: the QR starts on the first
// inked row and spans n modules; everything below it is the text block.
async function anatomy(s: LabelSensor) {
  const { width, height, data } = await pixels(await renderLabel(s));
  const black = (x: number, y: number) => data[(y * width + x) * 4] === 0;
  const rowInk = (y: number) => Array.from({ length: width }, (_, x) => x).filter((x) => black(x, y));
  let top = 0;
  while (top < height && rowInk(top).length === 0) top++;
  const finders = rowInk(top); // top edge of the two upper finder patterns
  const n = QRCode.create(`${INSTALL_BASE}${s.deviceId}`, { errorCorrectionLevel: "H" }).modules.size;
  let textInk = 0;
  let textRaster = "";
  for (let y = top + n * 4; y < height; y++) {
    for (let x = 0; x < width; x++) {
      textInk += +black(x, y);
      textRaster += black(x, y) ? "#" : ".";
    }
    textRaster += "\n";
  }
  return { width, height, black, n, qrSpan: finders[finders.length - 1] - finders[0] + 1, textInk, textRaster };
}

describe("renderLabel", () => {
  it("is exactly the printer's native size", async () => {
    const p = await pixels(await renderLabel(PLAIN));
    expect([p.width, p.height]).toEqual([LABEL_WIDTH, LABEL_HEIGHT]);
  });

  it("is pure black on white — no grey for the thermal head to dither", async () => {
    const { data } = await pixels(await renderLabel(PLAIN));
    let grey = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if ((r !== 0 && r !== 255) || g !== r || b !== r) grey++;
    }
    expect(grey).toBe(0);
  });

  it("draws the QR at level H, exactly 4 dots per module", async () => {
    const a = await anatomy(PLAIN);
    expect(a.qrSpan).toBe(a.n * 4);
  });

  // A label with its QR but no text decodes fine and is useless on a box —
  // the failure a size or QR check cannot see.
  it("prints text under the QR", async () => {
    expect((await anatomy(PLAIN)).textInk).toBeGreaterThan(1000);
  });

  it("prints the friendly name — more ink, not just the lines moved down", async () => {
    const without = (await anatomy(PLAIN)).textInk;
    const withName = (await anatomy({ ...PLAIN, name: "Λακωνίας, Δάφνη" })).textInk;
    expect(withName - without).toBeGreaterThan(300);
  });

  it("prints the token, the setup AP and the hardware-id tail", async () => {
    // Same-length token: same QR version, so the text block starts on the same row.
    const text = async (s: LabelSensor) => (await anatomy(s)).textRaster;
    const plain = await text(PLAIN);
    expect(await text({ ...PLAIN, deviceId: "a57ksukdg7hp9td6" })).not.toBe(plain);
    expect(await text({ ...PLAIN, apName: "Soundwatch-9999" })).not.toBe(plain);
    expect(await text({ ...PLAIN, hardwareId: "6A2A71F50305247522E3120FF0D9999" })).not.toBe(plain);
    expect(await text({ ...PLAIN, hardwareId: "FFFF71F50305247522E3120FF0D0226" })).toBe(plain); // only the tail
  });

  it("carries a QR that decodes to the install URL", async () => {
    const p = await pixels(await renderLabel(PLAIN));
    expect(jsQR(new Uint8ClampedArray(p.data), p.width, p.height)?.data).toBe(`${INSTALL_BASE}${PLAIN.deviceId}`);
  });

  it("fits a Greek friendly name and still decodes", async () => {
    const s = { ...PLAIN, deviceId: "rhzsmn2yq77j43w8", name: "Λακωνίας, Δάφνη" };
    const p = await pixels(await renderLabel(s));
    expect(jsQR(new Uint8ClampedArray(p.data), p.width, p.height)?.data).toBe(`${INSTALL_BASE}${s.deviceId}`);
  });

  it("ellipsizes an over-long name instead of overflowing the tape", async () => {
    const a = await anatomy({ ...PLAIN, name: "Λεωφόρος Βασιλίσσης Σοφίας και Κηφισίας, απέναντι από το περίπτερο" });
    let edgeInk = 0;
    for (let y = 0; y < a.height; y++)
      for (let x = 0; x < 6; x++) edgeInk += +a.black(x, y) + +a.black(a.width - 1 - x, y);
    expect(edgeInk).toBe(0);
  });

  it("renders a legacy 6-char token", async () => {
    const s = { ...PLAIN, deviceId: "bench3" };
    const p = await pixels(await renderLabel(s));
    expect(jsQR(new Uint8ClampedArray(p.data), p.width, p.height)?.data).toBe(`${INSTALL_BASE}bench3`);
  });

  it("renders with no hardware id, and the QR still decodes", async () => {
    const s = { ...PLAIN, deviceId: "nohw1234567890ab", hardwareId: null };
    const p = await pixels(await renderLabel(s));
    expect(jsQR(new Uint8ClampedArray(p.data), p.width, p.height)?.data).toBe(`${INSTALL_BASE}${s.deviceId}`);
  });
});

describe("renderLabel font registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails loudly instead of rendering with a missing font", async () => {
    vi.resetModules();
    vi.spyOn(GlobalFonts, "registerFromPath").mockReturnValueOnce(null);
    const { renderLabel: freshRenderLabel } = await import("./render");
    await expect(freshRenderLabel(PLAIN)).rejects.toThrow(/label font missing/);
  });
});

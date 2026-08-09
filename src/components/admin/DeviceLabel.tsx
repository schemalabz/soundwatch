"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

// Print-ready device label for 50 mm continuous thermal tape, monochrome,
// 8 dots/mm -> 400 px wide; ~72 mm long -> 576 px. Rendered entirely
// client-side from the sensor row: the label is a view of the database,
// never a second source of truth — re-provision then reprint and it's
// current again.
//
// Content, each line with a job (see the 2026-08-04 label spec):
//   QR (level H — outdoor scuffing)  -> install page
//   token, loudest text              -> support-call identity
//   setup AP name                    -> join the right box on a table of them
//   hardware id last 6               -> swapped-box tiebreaker
//   typed URL fallback               -> camera won't scan
// Pure black on white only: thermal dithering ruins QR edges.

const W = 400;
const H = 576;
const NAME_EXTRA = 44; // label grows when a friendly name is printed — tape is continuous
const QR_SIZE = 320;

export type LabelSensor = {
  deviceId: string;
  name: string | null;
  apName: string | null;
  hardwareId: string | null;
};

async function renderLabel(canvas: HTMLCanvasElement, sensor: LabelSensor) {
  const url = `https://soundwatch.gr/install/${sensor.deviceId}`;

  canvas.width = W;
  canvas.height = sensor.name ? H + NAME_EXTRA : H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, {
    errorCorrectionLevel: "H",
    width: QR_SIZE,
    margin: 4, // quiet zone in modules
    color: { dark: "#000000", light: "#ffffff" },
  });
  ctx.drawImage(qr, (W - QR_SIZE) / 2, 8);

  ctx.fillStyle = "#000";
  ctx.textAlign = "center";

  // Friendly name first when there is one — with random 16-char tokens the
  // name is the identity a human actually reads ("bench 2", a street name).
  let y = QR_SIZE;
  if (sensor.name) {
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText(sensor.name, W / 2, y + 48);
    y += NAME_EXTRA;
  }

  // Token — ~5 mm, the loudest text on the label.
  ctx.font = "bold 38px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(sensor.deviceId, W / 2, y + 52);

  // Setup AP — what the installer needs before the QR matters.
  ctx.font = "26px system-ui, sans-serif";
  ctx.fillText("Setup WiFi:", W / 2, y + 96);
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText(sensor.apName ?? "—", W / 2, y + 130);

  // Hardware id tail — swapped-box tiebreaker.
  ctx.font = "24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`HW …${(sensor.hardwareId ?? "").slice(-6) || "?"}`, W / 2, y + 168);

  // Typed fallback, split so it stays legible at ~2.5 mm.
  ctx.font = "20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("soundwatch.gr/install/", W / 2, y + 210);
  ctx.fillText(sensor.deviceId, W / 2, y + 234);
}

export default function DeviceLabel({
  sensor,
  onClose,
}: {
  sensor: LabelSensor;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) void renderLabel(canvasRef.current, sensor);
  }, [sensor]);

  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    const file = new File([blob], `label-${sensor.deviceId}.png`, { type: "image/png" });

    // iOS Safari ignores programmatic downloads (the download attribute on
    // data:/blob: anchors), so on devices that can share files the share sheet
    // is the reliable path — and it is also the route into Photos, where
    // label-printer apps look for images. AbortError = the user closed the
    // sheet on purpose; do not "helpfully" fall through to a second prompt.
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // otherwise fall through to the anchor download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Label — {sensor.deviceId}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">
            ✕
          </button>
        </div>
        {/* Preview at half width; height follows the canvas (it grows when a
            name is printed). The download is the full-resolution print raster. */}
        <canvas
          ref={canvasRef}
          style={{ width: W / 2, height: "auto" }}
          className="border border-border rounded"
        />
        <p className="text-xs text-muted-foreground max-w-[200px]">
          50 mm tape · 8 dots/mm · print at 100%, no scaling
        </p>
        <button
          onClick={download}
          className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

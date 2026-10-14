"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

// The label is rendered server-side (src/lib/label/render.ts) and served by
// /api/admin/sensors/<token>/label — the same bytes the bench prints, so this
// preview cannot drift from paper. 272x384 at 8 dots/mm: 34 mm of 48 mm tape,
// printed rotated 90° on the MXW01.
export default function DeviceLabel({
  deviceId,
  onClose,
}: {
  deviceId: string;
  onClose: () => void;
}) {
  // The shell's token, not localStorage: AdminShell owns the session, and a
  // 401 here must log out like every other admin call (api() can't fetch a blob).
  const { token, logout } = useAdmin();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    // Reset state when effect re-runs for a different sensor
    /* eslint-disable react-hooks/set-state-in-effect */
    setError("");
    setBlob(null);
    setUrl(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    (async () => {
      try {
        const res = await fetch(`/api/admin/sensors/${encodeURIComponent(deviceId)}/label`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          logout();
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError(body.detail ?? body.error ?? `HTTP ${res.status}`);
          return;
        }
        const b = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(`Could not load the label: ${(err as Error).message}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [deviceId, token, logout]);

  async function download() {
    if (!blob) return;
    const file = new File([blob], `label-${deviceId}.png`, { type: "image/png" });

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

    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
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
          <h3 className="font-bold">Label — {deviceId}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">
            ✕
          </button>
        </div>
        {/* Shown at 1 dot = 1 CSS px with crisp edges, so what you see is the
            raster the printer burns. */}
        {url ? (
          <div className="border border-border rounded overflow-hidden w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, not an optimisable asset */}
            <img
              src={url}
              alt={`Label for ${deviceId}`}
              width={272}
              height={384}
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : (
          <div className="w-[272px] h-[384px] border border-border rounded flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
            {error || "Rendering…"}
          </div>
        )}
        <p className="text-xs text-muted-foreground max-w-[272px]">
          34 × 48 mm · 8 dots/mm · print rotated 90° on 48 mm tape, at 100%, no scaling
        </p>
        <button
          onClick={download}
          disabled={!blob}
          className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-40"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

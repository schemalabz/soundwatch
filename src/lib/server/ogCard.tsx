// The share card every Open Graph image is drawn with: the lockup, a
// headline and a lead on the left; on the right, a patch of the map — rings
// in the level ramp, two carrying the «versus usual» pill — so a preview
// looks like the thing it links to.
//
// Rendered at build time (the routes using it read no request data), so the
// fonts and the logotype are read from disk here and never at runtime.
// Commissioner because the copy is Greek; the TTFs live in assets/fonts
// (next/og cannot read the woff2 that next/font serves).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SKROUTZ_LOGOTYPE } from "@/lib/brand";

export const OG_SIZE = { width: 1200, height: 630 } as const;

const INK = "#0e0e1c";
const SLATE = "#363636";
const SOUND = "#f68b24";
const LOUD = "#f44a04";
const PALE = "#f8a85b";
const PAPER = "#fafafa";

/** The map patch: [left, top, diameter, ring colour, pill]. Hand-placed. */
const RINGS: [number, number, number, string, string | null][] = [
  [150, 70, 54, PALE, null],
  [300, 40, 34, SLATE, null],
  [70, 190, 40, SLATE, null],
  [220, 170, 128, SOUND, null],
  [380, 150, 70, LOUD, "+10"],
  [120, 330, 92, SOUND, null],
  [290, 340, 46, PALE, null],
  [400, 300, 58, SOUND, null],
  [210, 450, 64, LOUD, "+7"],
  [60, 470, 30, SLATE, null],
  [360, 470, 38, PALE, null],
];

async function assets() {
  const [medium, bold, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Commissioner-Medium.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Commissioner-Bold.ttf")),
    readFile(join(process.cwd(), "public", SKROUTZ_LOGOTYPE.src)),
  ]);
  return { medium, bold, logo: `data:image/png;base64,${logo.toString("base64")}` };
}

export async function ogCard({ label, title, lead }: { label?: string; title: string; lead: string }): Promise<ImageResponse> {
  const { medium, bold, logo } = await assets();
  // The brandbook's 70 px minimum, comfortably cleared.
  const logoHeight = 30;
  const logoWidth = Math.round((logoHeight * SKROUTZ_LOGOTYPE.w) / SKROUTZ_LOGOTYPE.h);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, fontFamily: "Commissioner", color: INK }}>
        {/* words */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "64px 0 56px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>
              soundwatch<span style={{ color: SOUND }}>.</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 14 14">
              <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" stroke={SLATE} strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={logoWidth} height={logoHeight} alt="" style={{ marginTop: 6 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 22 }}>
            {label && <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: SOUND }}>{label}</div>}
            <div style={{ display: "flex", fontSize: 74, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2.5, maxWidth: 620 }}>
              {title}
            </div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 500, lineHeight: 1.35, color: "#4a4a55", maxWidth: 580 }}>
              {lead}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 40, fontSize: 24, fontWeight: 700 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: SOUND }} />
            soundwatch.gr
          </div>
        </div>

        {/* a patch of the map */}
        <div
          style={{
            width: 500,
            height: "100%",
            display: "flex",
            position: "relative",
            background: "#f0f0f0",
            backgroundImage: "linear-gradient(#e2e2e2 1px, transparent 1px), linear-gradient(90deg, #e2e2e2 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        >
          {RINGS.map(([left, top, d, color, pill]) => (
            <div key={`${left}:${top}`} style={{ position: "absolute", left, top, display: "flex" }}>
              <div style={{ width: d, height: d, borderRadius: d, border: `3px solid ${color}` }} />
              {pill && (
                <div
                  style={{
                    position: "absolute",
                    left: d * 0.78,
                    top: -14,
                    display: "flex",
                    padding: "4px 12px",
                    borderRadius: 16,
                    background: INK,
                    color: "#ffffff",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {pill}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Commissioner", data: medium, weight: 500, style: "normal" },
        { name: "Commissioner", data: bold, weight: 700, style: "normal" },
      ],
    }
  );
}

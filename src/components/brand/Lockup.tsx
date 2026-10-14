import Image from "next/image";
import Link from "next/link";
import { SKROUTZ_LOGOTYPE, SKROUTZ_MIN_WIDTH_PX } from "@/lib/brand";
import { cn } from "@/lib/utils";

// soundwatch ✕ skroutz — the partnership lockup from the Skroutz brandbook
// (horizontal lockup 01): two logotypes on a common x-height and baseline,
// separated by a bold "✕" in Dark Grey at half the logotype's height. The
// wordmark leads and the logotype follows in full colour (Skroutz asked for
// orange over the grayscale variant) at the brandbook's 70px minimum, or a
// touch wider when matching x-heights asks for it. The wordmark keeps its
// orange full stop, the sound accent.
//
// Alignment is by metrics, not by box centres: the flex row aligns
// baselines, the logotype's height is chosen so its x-height matches the
// wordmark's, and the ✕ is lifted to the middle of that x-height.

const WORD = { sm: 18, md: 20, lg: 22 } as const;
/** Commissioner Bold, measured in the browser: x-height as a fraction of the font size. */
const WORD_X_HEIGHT = 0.503;
/** The logotype image: its x-height as a fraction of the image height (k and t rise above). */
const LOGO_X_HEIGHT = 0.72;

function Logotype({ height }: { height: number }) {
  const art = SKROUTZ_LOGOTYPE;
  const w = Math.max(SKROUTZ_MIN_WIDTH_PX, Math.round((height * art.w) / art.h));
  const h = Math.round(((w * art.h) / art.w) * 10) / 10;
  return <Image src={art.src} alt="skroutz" width={Math.round(w)} height={Math.round(h)} className="block shrink-0" style={{ width: w, height: h }} />;
}

export default function Lockup({
  size = "md",
  href,
  logoOnly = false,
  className,
}: {
  size?: keyof typeof WORD;
  /** Wrap in a link (the home page from other pages). */
  href?: string;
  /** Just the Skroutz logotype: where Skroutz is introduced by name. */
  logoOnly?: boolean;
  className?: string;
}) {
  if (logoOnly) return <Logotype height={18} />;

  const word = WORD[size];
  const xHeight = word * WORD_X_HEIGHT;
  const logoH = Math.max(xHeight / LOGO_X_HEIGHT, (SKROUTZ_MIN_WIDTH_PX * SKROUTZ_LOGOTYPE.h) / SKROUTZ_LOGOTYPE.w);
  const x = Math.round(logoH / 2);
  // baseline-aligned, so the ✕ (which sits on the baseline) is lifted to the x-height's middle
  const lift = Math.round((xHeight / 2 - x / 2) * 10) / 10;

  const inner = (
    <span className={cn("inline-flex items-baseline", className)} style={{ gap: Math.round(word * 0.45) }}>
      <span className="font-bold leading-none tracking-tight text-foreground" style={{ fontSize: word }}>
        soundwatch<span className="text-sound">.</span>
      </span>
      <svg width={x} height={x} viewBox="0 0 14 14" aria-hidden="true" className="relative shrink-0" style={{ top: -lift }}>
        <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" stroke="var(--sw-slate)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </svg>
      <Logotype height={logoH} />
    </span>
  );

  return href ? (
    <Link href={href} aria-label="Soundwatch × Skroutz — αρχική" className="inline-flex">
      {inner}
    </Link>
  ) : (
    inner
  );
}

import Image from "next/image";
import Link from "next/link";
import { SKROUTZ_LOGOTYPE, SKROUTZ_LOGOTYPE_GREY, SKROUTZ_MIN_WIDTH_PX } from "@/lib/brand";
import { cn } from "@/lib/utils";

// soundwatch ✕ skroutz — the partnership lockup from the Skroutz brandbook
// (horizontal lockup 01), weighted toward soundwatch: the wordmark sets the
// size, and the Skroutz logotype stays at the brandbook's 70px minimum in its
// grayscale variant, after a small Dark Grey "✕". The wordmark keeps its
// orange full stop, which is the sound accent everywhere else.

const WORD = { sm: 15, md: 17, lg: 22 } as const;

function Logotype({ tone, width = SKROUTZ_MIN_WIDTH_PX }: { tone: "subtle" | "brand"; width?: number }) {
  const art = tone === "brand" ? SKROUTZ_LOGOTYPE : SKROUTZ_LOGOTYPE_GREY;
  const w = Math.max(SKROUTZ_MIN_WIDTH_PX, width);
  const h = Math.round((w * art.h) / art.w);
  return <Image src={art.src} alt="skroutz" width={w} height={h} className="block shrink-0" style={{ width: w, height: h }} />;
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
  /** Just the Skroutz logotype, in full colour: where Skroutz is introduced by name. */
  logoOnly?: boolean;
  className?: string;
}) {
  if (logoOnly) return <Logotype tone="brand" width={SKROUTZ_MIN_WIDTH_PX + 10} />;

  // the ✕ is half the logotype's height, as the brandbook's lockup grid has it
  const logoH = Math.round((SKROUTZ_MIN_WIDTH_PX * SKROUTZ_LOGOTYPE.h) / SKROUTZ_LOGOTYPE.w);
  const x = Math.round(logoH / 2);
  const inner = (
    <span className={cn("inline-flex items-center", className)} style={{ gap: Math.round(WORD[size] * 0.45) }}>
      <span className="font-bold leading-none tracking-tight text-foreground" style={{ fontSize: WORD[size] }}>
        soundwatch<span className="text-sound">.</span>
      </span>
      <svg width={x} height={x} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" stroke="var(--sw-slate)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </svg>
      <Logotype tone="subtle" />
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

import Link from "next/link";
import Lockup from "@/components/brand/Lockup";
import type { LegalDoc } from "@/lib/strings/legal";

// One plain reading column for the privacy notice and the terms. Copy comes
// from src/lib/strings/legal.ts. Square brackets mark text still to confirm
// and render highlighted, as on /about.
function Copy({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[") ? (
          <mark key={i} className="rounded-[3px] bg-sound/25 px-1 text-foreground">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export default function LegalPage({ doc, current }: { doc: LegalDoc; current: "privacy" | "terms" }) {
  const navLink = "text-muted-foreground transition-colors hover:text-foreground";
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b">
        <div className="mx-auto flex h-[60px] w-full max-w-[1120px] flex-wrap items-center justify-between gap-6 px-6">
          <Lockup size="lg" href="/" />
          <nav aria-label="Σελίδες" className="flex flex-wrap items-center gap-[18px] text-[13px] font-medium">
            <Link href="/" className={navLink}>Χάρτης</Link>
            <Link href="/about" className={navLink}>Σχετικά</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto w-full max-w-[720px] px-6 py-12">
        <h1 className="m-0 text-balance text-4xl font-bold leading-[1.1] tracking-tight">{doc.title}</h1>
        <p className="mt-3 text-[13px] text-muted-foreground">
          <Copy text={doc.updated} />
        </p>
        <p className="mt-6 text-lg leading-[1.5]">
          <Copy text={doc.lead} />
        </p>
        {doc.sections.map((s) => (
          <section key={s.title} className="mt-10">
            <h2 className="m-0 text-xl font-bold tracking-tight">{s.title}</h2>
            {s.body.map((p, i) =>
              p.startsWith("• ") ? (
                <p key={i} className="mt-3 border-l-2 border-border pl-4 text-base leading-[1.6] text-muted-foreground">
                  <Copy text={p.slice(2)} />
                </p>
              ) : (
                <p key={i} className="mt-3 text-base leading-[1.6] text-muted-foreground">
                  <Copy text={p} />
                </p>
              )
            )}
          </section>
        ))}
      </article>

      <footer className="border-t py-7">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-5 px-6 text-[13px]">
          <nav aria-label="Υποσέλιδο" className="flex flex-wrap gap-4">
            {current === "privacy" ? (
              <Link href="/terms" className={navLink}>Όροι χρήσης</Link>
            ) : (
              <Link href="/privacy" className={navLink}>Απόρρητο</Link>
            )}
          </nav>
          <div className="text-muted-foreground">Schema Labs · Αθήνα</div>
        </div>
      </footer>
    </div>
  );
}

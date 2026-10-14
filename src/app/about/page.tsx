import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import Lockup from "@/components/brand/Lockup";
import HowItWorks from "@/components/about/HowItWorks";
import { aboutStrings as tr } from "@/lib/strings/about";
import { pageTitle, SHARED_OPEN_GRAPH, SHARED_TWITTER } from "@/lib/strings/site";

export const metadata: Metadata = {
  title: tr.meta.title,
  description: tr.meta.description,
  alternates: { canonical: "/about" },
  openGraph: { ...SHARED_OPEN_GRAPH, url: "/about", title: pageTitle(tr.meta.title), description: tr.meta.description },
  twitter: { ...SHARED_TWITTER, title: pageTitle(tr.meta.title), description: tr.meta.description },
};

// Copy comes from src/lib/strings/about.ts; nothing is written here. Square
// brackets in a string are unconfirmed facts and render highlighted.
function Copy({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[") ? (
          <mark key={i} className="rounded-[3px] bg-sound/25 px-1 text-foreground">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

const kicker = "text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const card = "flex flex-col gap-2.5 rounded-[14px] border bg-card p-6";

export default function AboutPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b">
        <div className="mx-auto flex h-[60px] w-full max-w-[1120px] flex-wrap items-center justify-between gap-6 px-6">
          <Lockup size="lg" href="/" />
          <nav aria-label="Σελίδες" className="flex flex-wrap items-center gap-[18px] text-[13px] font-medium">
            <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
              {tr.nav.map}
            </Link>
            <Link href="/status" className="text-muted-foreground transition-colors hover:text-foreground">
              {tr.nav.status}
            </Link>
            <a href="/api/docs" className="text-muted-foreground transition-colors hover:text-foreground">
              {tr.nav.api}
            </a>
            <span aria-current="page" className="border-b-2 border-sound pb-0.5 font-bold text-foreground">
              {tr.nav.about}
            </span>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="pb-[72px] pt-[88px]">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-[22px] px-6">
          <div className={kicker}>{tr.hero.kicker}</div>
          <h1 className="m-0 text-[clamp(38px,6vw,68px)] font-bold leading-[1.02] tracking-[-0.025em] text-balance">
            {tr.hero.title}
          </h1>
          <p className="m-0 max-w-[700px] text-[19px] leading-[1.5] text-muted-foreground text-pretty">{tr.hero.lead}</p>
          <div className="mt-1.5 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex h-12 items-center rounded-[10px] bg-ink px-[22px] text-[15px] font-semibold text-white no-underline">
              {tr.hero.ctaMap}
            </Link>
            <a href="#how" className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-slate px-[22px] text-[15px] font-semibold text-foreground no-underline">
              {tr.hero.ctaHow} <ArrowDown className="size-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* what */}
      <section className="pb-20">
        <div className="mx-auto grid w-full max-w-[1120px] gap-5 px-6 md:grid-cols-3">
          {tr.what.cards.map((c) => (
            <div key={c.title} className={card}>
              <h2 className="m-0 text-[19px] font-bold">{c.title}</h2>
              <p className="m-0 text-[15px] leading-[1.5] text-muted-foreground">
                <Copy text={c.body} />
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* who */}
      <section className="pb-24">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-6">
          <div className="flex max-w-[720px] flex-col gap-2">
            <div className={kicker}>{tr.who.kicker}</div>
            <h2 className="m-0 text-balance text-4xl font-bold leading-[1.1] tracking-tight">{tr.who.title}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className={`${card} gap-3.5`}>
              <Lockup logoOnly />
              <p className="m-0 text-[15px] leading-[1.5] text-muted-foreground">{tr.who.skroutz.body}</p>
              <a href={tr.who.skroutz.href} className="text-sm font-semibold text-foreground">
                {tr.who.skroutz.link} ↗
              </a>
            </div>
            <div className={`${card} gap-3.5`}>
              <div className="text-[22px] font-bold tracking-tight">{tr.who.schema.name}</div>
              <p className="m-0 text-[15px] leading-[1.5] text-muted-foreground">{tr.who.schema.body}</p>
              <a href={tr.who.schema.href} className="text-sm font-semibold text-foreground">
                {tr.who.schema.link} ↗
              </a>
            </div>
          </div>
          {/* Where the idea came from, and the credential for the method: two
              quiet lines under the two partners, not a third and fourth card. */}
          <div className="flex max-w-[860px] flex-col gap-1.5 border-l-2 border-border pl-4">
            <div className="text-sm font-semibold text-foreground">{tr.who.astylab.name}</div>
            <p className="m-0 text-sm leading-[1.5] text-muted-foreground">
              {tr.who.astylab.body}{" "}
              <a href={tr.who.astylab.href} className="font-semibold text-foreground">
                {tr.who.astylab.link} ↗
              </a>
            </p>
          </div>
          <div className="flex max-w-[860px] flex-col gap-1.5 border-l-2 border-border pl-4">
            <div className="text-sm font-semibold text-foreground">{tr.who.review.name}</div>
            <p className="m-0 text-sm leading-[1.5] text-muted-foreground">
              {tr.who.review.body}{" "}
              <a href={tr.who.review.href} className="font-semibold text-foreground">
                {tr.who.review.link} ↗
              </a>
            </p>
          </div>
        </div>
      </section>

      <HowItWorks />

      {/* honesty */}
      <section className="bg-muted pb-20 pt-24">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-6">
          <div className="flex max-w-[760px] flex-col gap-2">
            <div className={kicker}>{tr.honesty.kicker}</div>
            <h2 className="m-0 text-balance text-4xl font-bold leading-[1.1] tracking-tight">{tr.honesty.title}</h2>
            <p className="m-0 text-base leading-[1.5] text-muted-foreground">{tr.honesty.caveat}</p>
            <p className="m-0 text-base leading-[1.5] text-muted-foreground">
              {tr.honesty.verified.text}{" "}
              <a href={tr.honesty.verified.href} className="font-semibold text-foreground">
                {tr.honesty.verified.link} ↗
              </a>
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className={`${card} gap-3`}>
              <div className="flex items-center gap-2 text-[13px] font-bold">
                <span className="size-2.5 rounded-full bg-ok" /> {tr.honesty.can.title}
              </div>
              <ul className="m-0 flex flex-col gap-2 pl-[18px] text-[15px] leading-[1.45] text-muted-foreground">
                {tr.honesty.can.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className={`${card} gap-3`}>
              <div className="flex items-center gap-2 text-[13px] font-bold">
                <span className="size-2.5 rounded-full bg-loud" /> {tr.honesty.cannot.title}
              </div>
              <ul className="m-0 flex flex-col gap-2 pl-[18px] text-[15px] leading-[1.45] text-muted-foreground">
                {tr.honesty.cannot.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {tr.honesty.facts.map((f) => (
              <div key={f.big} className={card}>
                <div className="text-[28px] font-bold tracking-tight tabular-nums">{f.big}</div>
                <div className="text-[15px] font-semibold">{f.title}</div>
                <p className="m-0 text-sm leading-[1.5] text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* open */}
      <section id="open" className="pb-20 pt-24">
        <div className="mx-auto grid w-full max-w-[1120px] items-start gap-10 px-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className={kicker}>{tr.open.kicker}</div>
            <h2 className="m-0 text-balance text-4xl font-bold leading-[1.1] tracking-tight">{tr.open.title}</h2>
            <p className="m-0 text-base leading-[1.5] text-muted-foreground">{tr.open.lead}</p>
          </div>
          <div className="flex flex-col gap-3">
            {tr.open.links.map((l) => (
              <a key={l.href} href={l.href} className="flex items-center justify-between gap-3 rounded-xl border px-[18px] py-4 text-foreground no-underline transition-colors hover:border-slate">
                <span>
                  <b>{l.title}</b>
                  <br />
                  <span className="text-[13px] text-muted-foreground">{l.sub}</span>
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            ))}
            <a href={`mailto:${tr.open.contact.email}`} className="flex items-center justify-between gap-3 rounded-xl border px-[18px] py-4 text-foreground no-underline transition-colors hover:border-slate">
              <span>
                <b>{tr.open.contact.title}</b>
                <br />
                <span className="text-[13px] text-muted-foreground">{tr.open.contact.email}</span>
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t py-7">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-5 px-6">
          <Lockup size="sm" />
          <nav aria-label="Υποσέλιδο" className="flex flex-wrap gap-4 text-[13px]">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              {tr.nav.map}
            </Link>
            <Link href="/status" className="text-muted-foreground hover:text-foreground">
              {tr.nav.status}
            </Link>
            <a href="/api/docs" className="text-muted-foreground hover:text-foreground">
              {tr.nav.api}
            </a>
            <span className="text-muted-foreground/70">{tr.footer.privacy}</span>
            <span className="text-muted-foreground/70">{tr.footer.terms}</span>
          </nav>
          <div className="text-[13px] text-muted-foreground">{tr.footer.org}</div>
        </div>
      </footer>
    </div>
  );
}

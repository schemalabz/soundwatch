// Generates docs/copy/about-copy.docx from src/lib/strings/about.ts: every
// string on /about under a small grey key, so the document can be edited and
// the edits mapped back to the exact field. Run from the repo root:
//   npx tsx scripts/about-copy-docx.ts
import { writeFileSync, mkdirSync } from "node:fs";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
} from "docx";
import { aboutStrings } from "../src/lib/strings/about";

type Entry = { key: string; text: string };

function walk(v: unknown, key: string, out: Entry[]) {
  if (typeof v === "string") out.push({ key, text: v });
  else if (typeof v === "function") return;
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, key ? `${key}.${k}` : k, out);
}

const SECTION_TITLES: Record<string, string> = {
  meta: "Τίτλος και περιγραφή σελίδας (meta)",
  nav: "Πλοήγηση (nav)",
  hero: "Εισαγωγή (hero)",
  what: "Τι είναι (what)",
  who: "Ποιοι είμαστε (who)",
  how: "Πώς δουλεύει (how)",
  honesty: "Τι μπορούμε να πούμε (honesty)",
  open: "Ανοιχτά (open)",
  footer: "Υποσέλιδο (footer)",
};
const SKIP_KEYS = /\.(href|madeWithHref|id)$|^how\.mapSensors/;

const entries: Entry[] = [];
walk(aboutStrings, "", entries);

const GREY = "7a7a7a";
const ORANGE_BG = "FDE2C8";

function textRuns(text: string): TextRun[] {
  // [placeholder] gets a highlight so it cannot ship unnoticed
  return text.split(/(\[[^\]]+\])/g).filter(Boolean).map((p) =>
    p.startsWith("[")
      ? new TextRun({ text: p, shading: { type: "clear", fill: ORANGE_BG, color: "auto" }, bold: true })
      : new TextRun({ text: p })
  );
}

const children: Paragraph[] = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Soundwatch — κείμενα της σελίδας «Σχετικά»")] }),
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: "Πηγή: src/lib/strings/about.ts · ", color: GREY, size: 18 }), new TextRun({ text: new Date().toISOString().slice(0, 10), color: GREY, size: 18 })],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: "Πώς να το επεξεργαστείς", bold: true })],
  }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun("Άλλαξε μόνο το κείμενο κάτω από κάθε γκρίζο κλειδί. Τα κλειδιά (π.χ. how.stages[2].body[1]) μένουν ως έχουν: με αυτά ξαναμπαίνει το κείμενο στη σελίδα.")] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun("Ό,τι είναι σε αγκύλες και χρωματισμένο, π.χ. "), ...textRuns("[Όνομα]"), new TextRun(", είναι κενό που περιμένει πραγματικό στοιχείο. Γράψε το στοιχείο στη θέση του, μαζί με τις αγκύλες αν δεν είναι ακόμη σίγουρο.")] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun("Τα ονόματα των μετρήσεων είναι κοινά με τον χάρτη και τη σελίδα κάθε αισθητήρα: Μέση (LAeq), Διάμεσος (L50), Αιχμές (L10), Υπόβαθρο (L90), Μέγιστη (Lmax). Αν αλλάξουν εδώ, πρέπει να αλλάξουν παντού.")] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun("Μία γραμμή σε κάθε πεδίο· παράγραφοι του ίδιου βήματος είναι ξεχωριστά πεδία (body[0], body[1]).")] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun("Στις ενδείξεις κάτω από τα σχέδια, ό,τι είναι σε άγκιστρα, π.χ. {n} ή {name}, το συμπληρώνει το σχέδιο την ώρα που τρέχει: κράτησέ το όπως είναι.")] }),
];

let section = "";
let stage = -1;
let lastFig = "";
for (const e of entries) {
  if (SKIP_KEYS.test(e.key)) continue;
  const top = e.key.split(".")[0];
  if (top !== section) {
    section = top;
    stage = -1;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: [new TextRun(SECTION_TITLES[top] ?? top)] }));
  }
  const m = e.key.match(/^how\.stages\[(\d+)\]\./);
  if (m && Number(m[1]) !== stage) {
    stage = Number(m[1]);
    const title = aboutStrings.how.stages[stage].title;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun(`Βήμα ${stage + 1} · ${title}`)] }));
  }
  const fig = e.key.match(/^how\.figures\.(\w+)\./);
  if (fig && fig[1] !== lastFig) {
    lastFig = fig[1];
    const n = aboutStrings.how.stages.findIndex((st) => st.id === (fig[1] === "map" ? "map" : fig[1]));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun(`Λέξεις μέσα στο σχέδιο ${n + 1} · ${aboutStrings.how.stages[n]?.title ?? fig[1]}`)] }));
  }
  if (e.key === "how.formulas.title") {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun("Πίνακας τύπων")] }));
  }
  children.push(
    new Paragraph({
      spacing: { before: 160, after: 20 },
      keepNext: true,
      children: [new TextRun({ text: e.key, font: "Consolas", size: 16, color: GREY })],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E2E2", space: 4 } },
      children: textRuns(e.text),
    })
  );
}

const doc = new Document({
  creator: "soundwatch",
  title: "Soundwatch — κείμενα σελίδας Σχετικά",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", run: { size: 44, bold: true, color: "0E0E1C" }, paragraph: { spacing: { after: 120 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: "0E0E1C" } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: "F68B24" } },
    ],
  },
  sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1247, right: 1247 } } }, children }],
});

const out = "docs/copy/about-copy.docx";
mkdirSync("docs/copy", { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes,", entries.filter((e) => !SKIP_KEYS.test(e.key)).length, "fields");
});

// What the numbers mean, for a reader who knows nothing about sound. Shared:
// the sensor page renders every entry as its reading guide and each dotted
// label's tooltip; the dashboard can adopt the same entries. Greek metric
// names are the dashboard's (Μέση, Διάμεσος, Αιχμές, Υπόβαθρο, Μέγιστη) so the
// two pages use the same words.
//
// `percentiles` describes the PER-INTERVAL statistic the sensor page shows
// (the device's own L10/L50/L90 over the frames of one interval). The
// dashboard's L10/L50/L90 are percentiles ACROSS intervals — a different
// statistic with the same name. When the dashboard adopts this module it gets
// a sibling entry, not a reworded one.
//
// No instrument-specific language: the expert knows what they are doing, and
// it only confuses everyone else.

import { BAND_LABELS, HIST_BIN_DB, HIST_BINS, HIST_MIN_DB } from "../../../mqtt-ingester/flavor2";
import { HIST_TOP_DB, TOP_BIN_FLOOR_DB } from "@/lib/api/levels";
import type { AggKey } from "@/lib/dashboard/metrics";

/**
 * A metric every screen names. `label` is the Greek name, `code` the symbol
 * beside it. Two hints because the dashboard and the sensor page show
 * DIFFERENT statistics under the same name: the dashboard's L10/L50/L90 are
 * percentiles across intervals (rollup), the sensor page's are the device's
 * percentiles within one interval. Same words for the name, honest words for
 * the hint.
 */
export interface MetricTerm {
  label: string;
  code: string;
  hint: { rollup: string; interval: string };
}

/** Lmin is interval-only: the dashboard computes no across-intervals sibling,
 *  so there is no rollup statistic to disambiguate against and no rollup hint
 *  to write. It still has one declared label and one declared code, like the
 *  other five, instead of being recovered from a sentence by `split(" ")`. */
export type IntervalOnlyMetricTerm = Omit<MetricTerm, "hint"> & { hint: { interval: string } };

/** The five metrics the dashboard and the sensor page share, plus Lmin. The
 *  dashboard's metric picker is keyed on AggKey (see AGG_KEYS), so widening
 *  this table cannot leak an interval-only metric into it. */
export type MetricKey = AggKey | "lmin";

export const METRICS: Record<AggKey, MetricTerm> & Record<"lmin", IntervalOnlyMetricTerm> = {
  laeq: {
    label: "Μέση",
    code: "LAeq",
    hint: { rollup: "Ενεργειακός μέσος (LAeq)", interval: "Ενεργειακός μέσος του διαστήματος (LAeq)" },
  },
  l50: {
    label: "Διάμεσος",
    code: "L50",
    hint: { rollup: "Τυπική στάθμη — διάμεσος των διαστημάτων (L50)", interval: "Τυπική στάθμη — διάμεσος μέσα στο διάστημα (L50)" },
  },
  l10: {
    label: "Αιχμές",
    code: "L10",
    hint: { rollup: "Ξεπερνιέται στο 10% των διαστημάτων (L10)", interval: "Ξεπερνιέται στο 10% του διαστήματος (L10)" },
  },
  l90: {
    label: "Υπόβαθρο",
    code: "L90",
    hint: { rollup: "Ξεπερνιέται στο 90% των διαστημάτων (L90)", interval: "Ξεπερνιέται στο 90% του διαστήματος (L90)" },
  },
  lmax: {
    label: "Μέγιστη",
    code: "Lmax",
    hint: { rollup: "Δυνατότερο μεμονωμένο καρέ 11,6 ms (Lmax)", interval: "Δυνατότερο μεμονωμένο καρέ 11,6 ms (Lmax)" },
  },
  lmin: {
    label: "Ελάχιστη",
    code: "Lmin",
    hint: { interval: "Πιο ήσυχο μεμονωμένο καρέ 11,6 ms (Lmin)" },
  },
};

/**
 * "Μέση (LAeq)" — the name with its code in brackets, as the sensor page
 * labels a value.
 *
 * The brackets are load-bearing. "Μέση LAeq" reads in Greek as adjective plus
 * noun, "the average LAeq", implying an average taken OF Leq values — but Leq
 * is itself the energy average, so the label was either redundant or wrong
 * depending on how you read it. Bracketing makes the Greek word a gloss of the
 * symbol rather than a modifier of it, and matches what the hints above
 * already do ("Ενεργειακός μέσος (LAeq)"). Raised by the acoustician
 * reviewing the page.
 */
export function metricLabel(k: MetricKey): string {
  return `${METRICS[k].label} (${METRICS[k].code})`;
}

/** The one caveat that governs every level on every screen. Was dashboardStrings.uncalibrated; verbatim. */
export const LEVEL_CAVEAT =
  "Σχετική στάθμη ήχου, χωρίς βαθμονόμηση — χρήσιμη για σύγκριση της ίδιας θέσης με την πάροδο του χρόνου, όχι με όρια θορύβου ή άλλα όργανα.";

export type GlossaryKey =
  | "interval"
  | "level"
  | "laeq"
  | "percentiles"
  | "lmax"
  | "coverage"
  | "lowerBound"
  | "spectrum"
  | "clocks"
  | "saturation"
  | "export";

export interface GlossaryEntry {
  /** Greek name, as shown on screen. */
  term: string;
  /** The code beside it (LAeq, L10 …), when there is one. */
  code?: string;
  /** One sentence for a tooltip. */
  short: string;
  /** The full explanation for the guide. */
  long: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  interval: {
    term: "Διάστημα",
    short: "Κάθε λίγα δευτερόλεπτα ο αισθητήρας συνοψίζει ό,τι άκουσε σε μία γραμμή.",
    long: "Ο αισθητήρας ακούει συνεχώς αλλά δεν στέλνει κάθε δευτερόλεπτο: κάθε λίγα δευτερόλεπτα συνοψίζει ό,τι άκουσε σε μία γραμμή. Η ώρα της γραμμής είναι η στιγμή που έφτασε η σύνοψη, λίγο μετά το τέλος του διαστήματος.",
  },
  level: {
    term: "Στάθμη",
    code: "dB",
    short: "Πόσο δυνατός είναι ο ήχος· +10 dB ακούγεται περίπου διπλάσιο.",
    long: `Πόσο δυνατός είναι ο ήχος, σε ντεσιμπέλ: +10 dB ακούγεται περίπου διπλάσιο. ${LEVEL_CAVEAT}`,
  },
  laeq: {
    term: METRICS.laeq.label,
    code: METRICS.laeq.code,
    short: "Αν όλος ο θόρυβος του διαστήματος απλωνόταν ομοιόμορφα, πόσο δυνατός θα ήταν.",
    long: "«Αν όλος ο θόρυβος του διαστήματος απλωνόταν ομοιόμορφα, πόσο δυνατός θα ήταν». Τα δυνατά κομμάτια μετράνε περισσότερο από τα ήσυχα. Είναι ο βασικός αριθμός της σελίδας.",
  },
  percentiles: {
    term: `${METRICS.l90.label} · ${METRICS.l50.label} · ${METRICS.l10.label}`,
    code: `${METRICS.l90.code} · ${METRICS.l50.code} · ${METRICS.l10.code}`,
    short: "Τρεις στιγμές του διαστήματος: ο θόρυβος που δεν σταματά, η τυπική στάθμη, οι κορυφές.",
    long: "Τρεις στιγμές του ίδιου διαστήματος. L90: ο θόρυβος που δεν σταματά ποτέ. L50: η τυπική στάθμη. L10: ό,τι ξεπεράστηκε μόνο το 10 % του χρόνου — όπως ένα μηχανάκι που περνά.",
  },
  lmax: {
    term: `${METRICS.lmax.label} · ${METRICS.lmin.label}`,
    code: `${METRICS.lmax.code} · ${METRICS.lmin.code}`,
    short: "Η πιο δυνατή και η πιο ήσυχη στιγμή του διαστήματος (καρέ 11,6 ms).",
    long: "Η πιο δυνατή και η πιο ήσυχη στιγμή. «Στιγμή» εδώ είναι ένα καρέ 11,6 χιλιοστών του δευτερολέπτου: έναν απότομο κρότο τον πιάνει ολόκληρο, γι' αυτό η Μέγιστη είναι συχνά αρκετά πάνω από τη Μέση.",
  },
  coverage: {
    term: "Κάλυψη ήχου",
    short: "Πόσο από τον χρόνο πρόλαβε να αναλύσει ο επεξεργαστής — εμφανίζεται μόνο όταν πέσει πολύ χαμηλά.",
    long: "Ο μικρός επεξεργαστής του αισθητήρα προλαβαίνει να αναλύσει περίπου το 30 % του χρόνου. Τα δείγματα απλώνονται σε όλο το διάστημα, οπότε η στάθμη βγαίνει σωστή και δεν χρειάζεται να το παρακολουθείτε. Γι' αυτό ο αριθμός δεν στέκεται μόνιμα στη σελίδα: βγαίνει προειδοποίηση μόνο όταν πέσει κάτω από ~5 %, όπου το διάστημα είναι πια ελλιπές και οι τιμές του αναξιόπιστες.",
  },
  lowerBound: {
    term: "«≥» μπροστά από τιμή",
    short: `«Τουλάχιστον»: ο ήχος έφτασε το τελευταίο σκαλοπάτι της κλίμακας (${TOP_BIN_FLOOR_DB}) — ίσως ήταν και παραπάνω.`,
    long: `Ο αισθητήρας δεν κρατά τις ίδιες τις στάθμες: κρατά ένα ιστόγραμμα από ${HIST_BINS} κουτάκια των ${HIST_BIN_DB} dB, από τα ${HIST_MIN_DB} ως τα ${HIST_TOP_DB} dB, και κάθε στιγμή προσθέτει μία μονάδα στο κουτάκι που της αναλογεί. Το τελευταίο κουτάκι όμως δεν είναι «${TOP_BIN_FLOOR_DB} ως ${HIST_TOP_DB}» — είναι «${TOP_BIN_FLOOR_DB} και πάνω, χωρίς όριο»: μια στιγμή λίγο πάνω από τα ${TOP_BIN_FLOOR_DB} dB και μια στιγμή στα 115 dB γράφονται ολόιδια και δεν ξεχωρίζουν μετά με κανέναν τρόπο. Όταν λοιπόν μια τιμή πέφτει σε αυτό το τελευταίο κουτάκι, το μόνο τίμιο που μπορεί να ειπωθεί είναι «τουλάχιστον τόσο» — γι' αυτό η σελίδα δείχνει «≥». Είναι γνωστός περιορισμός του σημερινού λογισμικού του αισθητήρα, που σκοπεύουμε να διορθώσουμε εκεί· δεν είναι σφάλμα της συγκεκριμένης μέτρησης.`,
  },
  spectrum: {
    term: "Φάσμα",
    short: "Ο ίδιος ήχος σε 21 ζώνες, μπάσα αριστερά, πρίμα δεξιά — χωρίς προσαρμογή στο αυτί.",
    long: "Ο ίδιος ήχος χωρισμένος σε 21 ζώνες, από τα μπάσα αριστερά ως τα πρίμα δεξιά. Χωρίς προσαρμογή στο πώς ακούει το αυτί, γι' αυτό δεν συγκρίνεται με τη Μέση.",
  },
  clocks: {
    term: "Ώρα",
    short: "Πότε έφτασε η μέτρηση — η ώρα που ταιριάζει με το ρολόι ενός άλλου οργάνου.",
    long: "Η στήλη δείχνει πότε έφτασε η μέτρηση. Ο αισθητήρας κρατά και δικό του ρολόι, αλλά εκείνο παρασύρεται — περίπου 20 δευτερόλεπτα την ώρα, ώσπου να συγχρονιστεί ξανά — και στην κορυφή της σελίδας γράφει πόσο μπροστά ή πίσω είναι αυτή τη στιγμή. Γι' αυτό δείχνουμε την ώρα άφιξης: είναι η ίδια βάση με τη σειρά των γραμμών και με το «πριν πόση ώρα», και είναι αυτή που ταιριάζει με το ρολόι ενός άλλου οργάνου. Αν χρειάζεστε την ώρα του ίδιου του αισθητήρα, περάστε τον δείκτη πάνω από μια γραμμή· υπάρχει και στο CSV, στη στήλη recorded_at.",
  },
  saturation: {
    term: "Κορεσμός",
    short: "Ο ήχος ήταν τόσο δυνατός που ο μετρητής «γέμισε»· η Μέση είναι κάτω όριο.",
    long: "Σπάνια προειδοποίηση: ο ήχος ήταν τόσο δυνατός που ο μετρητής «γέμισε». Η Μέση τότε είναι κάτω όριο — ο πραγματικός θόρυβος ήταν μεγαλύτερος.",
  },
  export: {
    term: "Το αρχείο CSV",
    short: "Η λήψη έχει ακριβώς τις γραμμές του πίνακα, με όλες τις τιμές που έστειλε ο αισθητήρας.",
    long: `Η λήψη περιέχει ακριβώς τα διαστήματα που δείχνει ο πίνακας για το παράθυρο που έχετε επιλέξει — μία γραμμή το καθένα — με όλες τις τιμές που έστειλε ο αισθητήρας, μαζί με τις ${BAND_LABELS.length} ζώνες του φάσματος και τα ${HIST_BINS} κουτάκια του ιστογράμματος. Οι τρεις στήλες l10_bound, l50_bound και l90_bound λένε αν η διπλανή τιμή είναι ακριβής (κενό), μόνο κάτω όριο (lower) ή μόνο πάνω όριο (upper). Αυτές να κοιτάτε, όχι τη στήλη top_bin_censored: εκείνη λέει απλώς ότι το διάστημα είχε κάποια δυνατή στιγμή και βγαίνει αληθινή πολύ πιο συχνά απ' όσο είναι πράγματι κομμένη μια τιμή.`,
  },
};

// The reading guide's display order IS GLOSSARY's declaration order above —
// derived, not re-declared, so a key added to GLOSSARY (and caught by the
// GlossaryKey exhaustiveness check) can't silently go missing from the guide.
export const GLOSSARY_ORDER = Object.keys(GLOSSARY) as GlossaryKey[];

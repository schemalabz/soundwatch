// Greek UI strings for the dashboard. Single-locale on purpose; extraction
// point for proper i18n later.

export const dashboardStrings = {
  filters: "Φίλτρα",
  reset: "Καθαρισμός φίλτρων",
  clear: "Καθαρισμός",
  // The verbal summary sentence itself lives in src/lib/dashboard/summary.ts
  // (it is grammar, not a string table).
  summary: {
    receipt: (count: string) => `≈ ${count} μετρήσεις`,
    zeroMeasurements: "0 μετρήσεις",
  },
  period: {
    label: "Περίοδος",
    recent: "Τελευταίες…",
    "24h": "24 ώρες",
    "7d": "7 ημέρες",
    "30d": "30 ημέρες",
    addRange: "Προσθήκη ημερομηνιών",
    rangeFrom: "Από",
    rangeTo: "Έως",
    rangeApply: "Προσθήκη περιόδου",
    rangeCancel: "Άκυρο",
    manyRanges: (n: number) => `${n} περίοδοι`,
  },
  days: { label: "Μέρες", weekend: "ΣΚ", weekday: "Καθημερινές" },
  hours: { label: "Ώρες", day: "Ημέρα", evening: "Βράδυ", night: "Νύχτα", peak: "Αιχμής" },
  months: { label: "Μήνες" },
  locations: {
    label: "Τοποθεσίες",
    add: "Επιλογή σημείου στον χάρτη",
    placing: "Κάνε κλικ στον χάρτη…",
    resolving: "Εντοπισμός…",
    remove: "Αφαίρεση",
    radius: "Ακτίνα",
    search: "Αναζήτηση διεύθυνσης…",
    noSensors: "δεν υπάρχουν αισθητήρες σε αυτό το εύρος",
  },
  pane: {
    close: "Κλείσιμο",
    goToMap: "Εμφάνιση στον χάρτη",
    lastReading: (ago: string) => `μέτρηση πριν ${ago}`,
    noData: "Χωρίς δεδομένα",
    last24h: "Τελευταίες 24 ώρες",
    statAvg: "Μέσο",
    statMin: "Ελάχ.",
    statMax: "Μέγ.",
  },
  footer: {
    about: "Σχετικά",
    privacy: "Απόρρητο",
    terms: "Όροι",
    api: "API",
    status: "Κατάσταση",
    soon: "σύντομα",
  },
  modes: {
    instants: "Στιγμιότυπα",
    aggregate: "Συγκεντρωτικά",
  },
  views: {
    map: "Χάρτης",
    board: "Κατάταξη",
    charts: "Γραφήματα",
  },
  board: {
    title: "Κατάταξη αισθητήρων",
    subtitlePrefix: "Από τον πιο θορυβώδη στον πιο ήσυχο · ",
    subtitleSuffix: " · στα επιλεγμένα φίλτρα",
    measurements: (n: string) => `${n} μετρήσεις`,
    empty: "Χωρίς δεδομένα για τα επιλεγμένα φίλτρα.",
  },
  charts: {
    timeline: "Χρονική εξέλιξη",
    timelineBand: "εύρος L90–L10",
    clock: "Το εικοσιτετράωρο",
    clockCaption: "ανά ώρα της ημέρας",
    dows: "Η εβδομάδα",
    dowsCaption: "ανά ημέρα της εβδομάδας",
    monthsTitle: "Οι μήνες",
    monthsCaption: "ανά μήνα",
    loudest: "πιο θορυβώδης",
    needsDays: "Χρειάζεται εύρος τουλάχιστον δύο ημερών — διάλεξε μεγαλύτερη περίοδο.",
    needsMonths: "Χρειάζεται εύρος πάνω από έναν μήνα — διάλεξε μεγαλύτερη περίοδο.",
    noData: "Χωρίς δεδομένα για τα επιλεγμένα φίλτρα.",
  },
  metricLabel: "Μέτρηση με",
  /** The metric's full wording — label + explanation — used EVERYWHERE the
   *  metric is referenced outside the picker itself. */
  aggregationFull: (k: "laeq" | "l50" | "l10" | "l90" | "lmax") =>
    `${dashboardStrings.aggregations[k].label} — ${dashboardStrings.aggregations[k].hint}`,
  aggregations: {
    laeq: { label: "Μέση", hint: "Ενεργειακός μέσος (LAeq)" },
    l50: { label: "Διάμεσος", hint: "Τυπική στάθμη (L50)" },
    l10: { label: "Αιχμές", hint: "Στάθμη που ξεπερνιέται το 10% του χρόνου (L10)" },
    l90: { label: "Υπόβαθρο", hint: "Στάθμη που ξεπερνιέται το 90% του χρόνου (L90)" },
    lmax: { label: "Μέγιστη", hint: "Δυνατότερη καταγεγραμμένη στιγμή (Lmax)" },
  },
  timebar: {
    live: "Μετάβαση στο τώρα",
    liveExcluded: "Το «τώρα» δεν περιλαμβάνεται στα επιλεγμένα φίλτρα",
    play: "Αναπαραγωγή",
    pause: "Παύση",
    speed: "Ταχύτητα αναπαραγωγής",
  },
} as const;

export const LOCALE = "el";

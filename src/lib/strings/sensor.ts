// Greek UI strings for the per-sensor live page. Single-locale on purpose;
// extraction point for proper i18n later. What a number MEANS lives in
// glossary.ts, not here — and a number the firmware defines (the histogram's
// top step) is quoted from the constant, never retyped into a sentence.

import { TOP_BIN_FLOOR_DB } from "@/lib/api/levels";

export const sensorStrings = {
  backToMap: "Χάρτης",
  benchBadge: "μονάδα δοκιμών",
  notFound: "Δεν βρέθηκε αισθητήρας.",
  loading: "…",
  live: {
    live: "ζωντανά",
    stale: "σίγησε",
    dead: "εκτός λειτουργίας",
    never: "δεν έχει στείλει ακόμα καμία μέτρηση",
    lastReading: "τελευταία μέτρηση πριν ",
    staleHint: "ελέγξτε ρεύμα και WiFi· η σελίδα θα συνεχίσει μόνη της",
    cadence: (s: number) => `νέα μέτρηση κάθε ~${s}δ`,
    clockAhead: (offset: string) => `ρολόι συσκευής ${offset} μπροστά`,
    clockBehind: (offset: string) => `ρολόι συσκευής ${offset} πίσω`,
    guideLink: "Τι σημαίνουν οι τιμές",
  },
  card: {
    latest: "Τελευταίο διάστημα",
    focused: (clock: string) => `Διάστημα ${clock}`,
    backToLive: "πίσω στο ζωντανό",
    olderInterval: "παλαιότερο διάστημα",
    newerInterval: "νεότερο διάστημα",
    /** Shown on the buttons' tooltips, so the keyboard route is discoverable. */
    navKeyHint: (label: string, key: string) => `${label} (${key})`,
    /** How far back the interval in focus sits, 1 = the newest in the window. */
    position: (i: number, n: number) => `${i} από ${n}`,
    outsideWindow: "εκτός του επιλεγμένου παραθύρου",
    stamps: (device: string, server: string) => `συσκευή ${device} · server ${server}`,
    duration: (s: string) => `${s} δ`,
    saturation: (n: number, metric: string) => `κορεσμός ×${n} — η ${metric} είναι κάτω όριο`,
    lowCoverage: (pct: string) => `ελλιπές διάστημα — αναλύθηκε μόνο το ${pct} του χρόνου`,
  },
  spectrum: {
    title: "Φάσμα",
    latest: "τελευταίο διάστημα",
    bands: (n: number) => `${n} ζώνες`,
    unweighted: "χωρίς στάθμιση A",
    none: "χωρίς φάσμα σε αυτό το διάστημα",
    yAxis: "dB",
    xAxis: "συχνότητα (Hz) · μπάσα → πρίμα",
  },
  log: {
    title: "Ημερολόγιο διαστημάτων",
    summary: (hours: number, n: number) =>
      `${hours === 1 ? "τελευταία 1 ώρα" : `τελευταίες ${hours} ώρες`} · ${n === 1 ? "1 μέτρηση" : `${n} μετρήσεις`} · κλικ σε γραμμή για το διάστημά της`,
    window: "Παράθυρο",
    windowOption: (h: number) => (h === 1 ? "1 ώρα" : `${h} ώρες`),
    csv: "Λήψη CSV",
    csvBusy: "Ετοιμάζεται…",
    colTime: "Ώρα",
    deviceTimeLabel: "ώρα συσκευής",
    newTag: "νέο",
    selectedTag: "επιλεγμένο",
    boundNote: `«≥ 89,1» σημαίνει: τουλάχιστον 89,1 — το διάστημα είχε στιγμές στο τελευταίο σκαλοπάτι της κλίμακας (≥ ${TOP_BIN_FLOOR_DB}), οπότε η τιμή είναι κάτω όριο.`,
    csvNote: "Το CSV περιέχει ακριβώς τις γραμμές αυτού του παραθύρου, με όλες τις τιμές — δείτε «Τι σημαίνουν οι τιμές».",
    cadenceNote: (s: number, pollS: number) => `Νέα γραμμή κάθε ~${s} δ · ανανέωση κάθε ${pollS} δ`,
    empty: "Καμία μέτρηση σε αυτό το παράθυρο.",
  },
  guide: {
    title: "Τι σημαίνουν οι τιμές",
  },
};

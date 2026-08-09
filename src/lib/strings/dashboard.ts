// Greek UI strings for the dashboard. Single-locale on purpose; extraction
// point for proper i18n later.

export const dashboardStrings = {
  filters: "Φίλτρα",
  reset: "Καθαρισμός φίλτρων",
  summary: {
    everything: "Όλες οι μετρήσεις",
    weekend: "Σαββατοκύριακα",
    weekday: "Καθημερινές",
    receipt: (hours: string, days: number) => `≈ ${hours} ώρες επιλεγμένες · δεδομένα ${days} ημερών`,
  },
  days: { label: "Μέρες", weekend: "ΣΚ", weekday: "Καθημερινές" },
  hours: { label: "Ώρες", day: "Ημέρα", evening: "Βράδυ", night: "Νύχτα" },
  months: { label: "Μήνες" },
  locations: {
    label: "Τοποθεσίες",
    soon: "Έρχεται σύντομα — αναζήτηση διεύθυνσης με ακτίνα.",
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

# Internationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add i18n with Greek as default (no URL prefix) and English at `/en/...` using `next-intl`.

**Architecture:** All pages move under `src/app/[locale]/`. Middleware routes requests to the correct locale. Translation JSONs in `src/messages/`. Client components use `useTranslations()`, server components use `getTranslations()`.

**Tech Stack:** next-intl, Next.js 16 App Router

---

### Task 1: Install next-intl and Create Config Files

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`
- Create: `src/i18n/routing.ts`
- Create: `src/i18n/request.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Install next-intl**

Run: `npm install next-intl`

- [ ] **Step 2: Create routing config**

Create `src/i18n/routing.ts`:

```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["el", "en"],
  defaultLocale: "el",
  localePrefix: "as-needed",
});
```

- [ ] **Step 3: Create request config**

Create `src/i18n/request.ts`:

```typescript
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as "el" | "en")) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 4: Create middleware**

Create `src/middleware.ts`:

```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

- [ ] **Step 5: Update next.config.ts**

Replace `next.config.ts` with:

```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts src/i18n/ src/middleware.ts
git commit -m "Add next-intl with el/en routing config"
```

---

### Task 2: Create Translation JSON Files

**Files:**
- Create: `src/messages/en.json`
- Create: `src/messages/el.json`

- [ ] **Step 1: Create English translations**

Create `src/messages/en.json`:

```json
{
  "nav": {
    "map": "Map",
    "leaderboard": "Leaderboard",
    "about": "About",
    "location": "Athens, Greece"
  },
  "map": {
    "loading": "Loading map...",
    "sensorsActive": "{count} {count, plural, one {sensor} other {sensors}} active",
    "updated": "Updated {time}",
    "noisiestRightNow": "Noisiest Right Now",
    "viewFullLeaderboard": "View full leaderboard →",
    "showMap": "Show Map",
    "leaderboard": "Leaderboard"
  },
  "leaderboard": {
    "title": "Soundwatch Leaderboard",
    "subtitle": "Ranking of noise levels across Athens",
    "noisiest": "Noisiest",
    "quietest": "Quietest",
    "noData": "No sensor data available"
  },
  "sensor": {
    "notFound": "Sensor not found",
    "backToMap": "← Back to map",
    "info": "Sensor Info",
    "deviceId": "Device ID",
    "firmware": "Firmware",
    "readingInterval": "Reading Interval",
    "lastSeen": "Last Seen",
    "coordinates": "Coordinates",
    "never": "Never",
    "viewDetails": "View details →",
    "noData": "No data",
    "whatIsThis": "What is this metric?"
  },
  "noise": {
    "quiet": "Quiet",
    "moderate": "Moderate",
    "loud": "Loud",
    "veryLoud": "Very Loud"
  },
  "guidelines": {
    "within": "Within {source} limit ({value} {unit})",
    "above": "Above {source} limit of {value} {unit}",
    "times": "{ratio}× {source} limit of {value} {unit}"
  },
  "metrics": {
    "environment": {
      "label": "Environment",
      "description": "Basic weather and environmental conditions at the sensor location."
    },
    "airQuality": {
      "label": "Air Quality",
      "description": "Particulate matter — tiny particles suspended in the air that can affect health when inhaled."
    },
    "uv": {
      "label": "UV Radiation",
      "description": "Ultraviolet radiation from the sun, measured in three wavelength bands."
    },
    "particleCounts": {
      "label": "Particle Counts",
      "description": "Number of particles per size category in a 0.1 liter air sample. Complements mass-based PM measurements."
    },
    "health": {
      "label": "Sensor Health",
      "description": "Operational status of the sensor hardware."
    },
    "noiseDba": {
      "label": "Noise",
      "description": "A-weighted sound pressure level — the standard measurement for environmental noise. Prolonged exposure above 70 dBA can cause hearing damage."
    },
    "temperature": {
      "label": "Temperature",
      "description": "Air temperature measured by the sensor. Affected by direct sunlight and nearby heat sources."
    },
    "humidity": {
      "label": "Humidity",
      "description": "Relative humidity — the amount of moisture in the air. Comfortable range is 30–60%."
    },
    "lightLux": {
      "label": "Light",
      "description": "Ambient light intensity. Full daylight is ~10,000–25,000 lux. Office lighting is ~300–500 lux."
    },
    "pressurePa": {
      "label": "Pressure",
      "description": "Atmospheric pressure. Standard sea-level pressure is 101.325 kPa. Changes indicate weather shifts."
    },
    "pm1": {
      "label": "PM1",
      "description": "Ultra-fine particles smaller than 1 micrometer. Can penetrate deep into the lungs and enter the bloodstream."
    },
    "pm25": {
      "label": "PM2.5",
      "description": "Fine particles smaller than 2.5 micrometers — the most health-relevant air quality metric. Main sources: traffic, combustion, dust."
    },
    "pm4": {
      "label": "PM4",
      "description": "Particles smaller than 4 micrometers. Includes PM2.5 plus some coarser particles."
    },
    "pm10": {
      "label": "PM10",
      "description": "Coarse particles smaller than 10 micrometers. Sources include dust, pollen, and road wear. Can irritate the respiratory system."
    },
    "uvA": {
      "label": "UVA",
      "description": "Long-wave UV (315–400nm). Penetrates deep into skin, causes aging. Present year-round, passes through clouds and glass."
    },
    "uvB": {
      "label": "UVB",
      "description": "Medium-wave UV (280–315nm). Causes sunburn and is the primary risk factor for skin cancer. Strongest midday in summer."
    },
    "uvC": {
      "label": "UVC",
      "description": "Short-wave UV (100–280nm). Mostly absorbed by the atmosphere. Readings near zero are normal."
    },
    "pn05": {
      "label": "PN0.5",
      "description": "Count of particles larger than 0.5 µm. The smallest particles detected — high counts indicate combustion sources."
    },
    "pn10": {
      "label": "PN1.0",
      "description": "Count of particles larger than 1.0 µm."
    },
    "pn25": {
      "label": "PN2.5",
      "description": "Count of particles larger than 2.5 µm."
    },
    "pn40": {
      "label": "PN4.0",
      "description": "Count of particles larger than 4.0 µm."
    },
    "pn100": {
      "label": "PN10",
      "description": "Count of particles larger than 10 µm. These are coarse particles like dust and pollen."
    },
    "tps": {
      "label": "Typical Size",
      "description": "The most common particle size in the sample. Helps identify the source — small (~0.5 µm) suggests combustion, large (~10 µm) suggests dust."
    },
    "battery": {
      "label": "Battery",
      "description": "Remaining battery charge. Sensors at Skroutz stores are plugged in, so this should stay high."
    },
    "rssi": {
      "label": "WiFi RSSI",
      "description": "WiFi signal strength. Above -50 is excellent, -50 to -70 is good, below -70 may cause connectivity issues."
    },
    "sdCard": {
      "label": "SD Card",
      "description": "Whether the SD card is present (1) or absent (0). Used for offline data buffering."
    }
  },
  "about": {
    "title": "About Soundwatch Athens",
    "backToMap": "← Back to map",
    "intro": "Athens consistently ranks among the noisiest capitals in Europe. Noise pollution is a critical urban challenge with direct impacts on public health and quality of life. Despite the scale of the problem, Athens today lacks a public, accessible noise monitoring network.",
    "mission": "Soundwatch Athens fills this gap by creating the city's first live noise map through a network of ~50 sensors deployed at Skroutz physical stores across Athens.",
    "howItWorksTitle": "How It Works",
    "howItWorks": "Each sensor measures noise levels (in dBA) locally on the device and transmits only the computed value — never raw audio — ensuring complete privacy. The data flows in real-time to this platform, where it's visualized on the interactive map.",
    "openDataTitle": "Open Data",
    "openData": "All sensor data is freely available through our public API. Anyone can access the data programmatically to build their own tools, conduct research, or advocate for change in their neighborhood.",
    "apiEndpoint": "API endpoint:",
    "whoWeAreTitle": "Who We Are",
    "whoWeAre": "Soundwatch Athens is built by Schema Labs, which builds technology that strengthens democracy, and Astylab, a community partner activating its ecosystem for urban transformation.",
    "technologyTitle": "Technology",
    "technology": "Built on the open-source Smart Citizen Kit platform. All software developed for Soundwatch is open source."
  }
}
```

- [ ] **Step 2: Create Greek translations**

Create `src/messages/el.json`:

```json
{
  "nav": {
    "map": "Χάρτης",
    "leaderboard": "Κατάταξη",
    "about": "Σχετικά",
    "location": "Αθήνα, Ελλάδα"
  },
  "map": {
    "loading": "Φόρτωση χάρτη...",
    "sensorsActive": "{count} {count, plural, one {αισθητήρας} other {αισθητήρες}} ενεργοί",
    "updated": "Ενημέρωση {time}",
    "noisiestRightNow": "Πιο Θορυβώδεις Τώρα",
    "viewFullLeaderboard": "Δείτε ολόκληρη την κατάταξη →",
    "showMap": "Χάρτης",
    "leaderboard": "Κατάταξη"
  },
  "leaderboard": {
    "title": "Κατάταξη Soundwatch",
    "subtitle": "Κατάταξη επιπέδων θορύβου στην Αθήνα",
    "noisiest": "Θορυβώδεις",
    "quietest": "Ήσυχοι",
    "noData": "Δεν υπάρχουν δεδομένα αισθητήρων"
  },
  "sensor": {
    "notFound": "Ο αισθητήρας δεν βρέθηκε",
    "backToMap": "← Πίσω στον χάρτη",
    "info": "Πληροφορίες Αισθητήρα",
    "deviceId": "ID Συσκευής",
    "firmware": "Firmware",
    "readingInterval": "Διάστημα Μέτρησης",
    "lastSeen": "Τελευταία Εμφάνιση",
    "coordinates": "Συντεταγμένες",
    "never": "Ποτέ",
    "viewDetails": "Λεπτομέρειες →",
    "noData": "Χωρίς δεδομένα",
    "whatIsThis": "Τι μετράει αυτό;"
  },
  "noise": {
    "quiet": "Ήσυχο",
    "moderate": "Μέτριο",
    "loud": "Δυνατό",
    "veryLoud": "Πολύ Δυνατό"
  },
  "guidelines": {
    "within": "Εντός ορίου {source} ({value} {unit})",
    "above": "Πάνω από το όριο {source} ({value} {unit})",
    "times": "{ratio}× όριο {source} ({value} {unit})"
  },
  "metrics": {
    "environment": {
      "label": "Περιβάλλον",
      "description": "Βασικές καιρικές και περιβαλλοντικές συνθήκες στη θέση του αισθητήρα."
    },
    "airQuality": {
      "label": "Ποιότητα Αέρα",
      "description": "Σωματιδιακή ύλη — μικροσκοπικά σωματίδια αιωρούμενα στον αέρα που μπορούν να επηρεάσουν την υγεία κατά την εισπνοή."
    },
    "uv": {
      "label": "Υπεριώδης Ακτινοβολία",
      "description": "Υπεριώδης ακτινοβολία από τον ήλιο, μετρημένη σε τρεις ζώνες μήκους κύματος."
    },
    "particleCounts": {
      "label": "Αριθμός Σωματιδίων",
      "description": "Αριθμός σωματιδίων ανά κατηγορία μεγέθους σε δείγμα αέρα 0,1 λίτρου. Συμπληρώνει τις μετρήσεις μάζας PM."
    },
    "health": {
      "label": "Κατάσταση Αισθητήρα",
      "description": "Λειτουργική κατάσταση του hardware του αισθητήρα."
    },
    "noiseDba": {
      "label": "Θόρυβος",
      "description": "Στάθμη ηχητικής πίεσης A-σταθμισμένη — η τυπική μέτρηση για τον περιβαλλοντικό θόρυβο. Παρατεταμένη έκθεση άνω των 70 dBA μπορεί να προκαλέσει βλάβη ακοής."
    },
    "temperature": {
      "label": "Θερμοκρασία",
      "description": "Θερμοκρασία αέρα στον αισθητήρα. Επηρεάζεται από άμεσο ηλιακό φως και κοντινές πηγές θερμότητας."
    },
    "humidity": {
      "label": "Υγρασία",
      "description": "Σχετική υγρασία — η ποσότητα υγρασίας στον αέρα. Άνετο εύρος 30–60%."
    },
    "lightLux": {
      "label": "Φωτισμός",
      "description": "Ένταση φωτισμού περιβάλλοντος. Πλήρες φως ημέρας ~10.000–25.000 lux. Φωτισμός γραφείου ~300–500 lux."
    },
    "pressurePa": {
      "label": "Πίεση",
      "description": "Ατμοσφαιρική πίεση. Τυπική πίεση επιπέδου θάλασσας 101,325 kPa. Αλλαγές υποδεικνύουν μεταβολές καιρού."
    },
    "pm1": {
      "label": "PM1",
      "description": "Υπερλεπτά σωματίδια μικρότερα από 1 μικρόμετρο. Μπορούν να εισχωρήσουν βαθιά στους πνεύμονες και στην κυκλοφορία του αίματος."
    },
    "pm25": {
      "label": "PM2.5",
      "description": "Λεπτά σωματίδια μικρότερα από 2,5 μικρόμετρα — η πιο σχετική με την υγεία μέτρηση ποιότητας αέρα. Κύριες πηγές: κυκλοφορία, καύση, σκόνη."
    },
    "pm4": {
      "label": "PM4",
      "description": "Σωματίδια μικρότερα από 4 μικρόμετρα. Περιλαμβάνει PM2.5 και κάποια χονδρότερα σωματίδια."
    },
    "pm10": {
      "label": "PM10",
      "description": "Χονδρά σωματίδια μικρότερα από 10 μικρόμετρα. Πηγές: σκόνη, γύρη, φθορά οδοστρώματος. Μπορούν να ερεθίσουν το αναπνευστικό σύστημα."
    },
    "uvA": {
      "label": "UVA",
      "description": "Μεγάλου μήκους κύματος UV (315–400nm). Εισχωρεί βαθιά στο δέρμα, προκαλεί γήρανση. Υπάρχει όλο τον χρόνο, περνά μέσα από σύννεφα και γυαλί."
    },
    "uvB": {
      "label": "UVB",
      "description": "Μεσαίου μήκους κύματος UV (280–315nm). Προκαλεί ηλιακό έγκαυμα και είναι ο κύριος παράγοντας κινδύνου για καρκίνο δέρματος. Ισχυρότερο το μεσημέρι το καλοκαίρι."
    },
    "uvC": {
      "label": "UVC",
      "description": "Μικρού μήκους κύματος UV (100–280nm). Απορροφάται κυρίως από την ατμόσφαιρα. Μετρήσεις κοντά στο μηδέν είναι φυσιολογικές."
    },
    "pn05": {
      "label": "PN0.5",
      "description": "Αριθμός σωματιδίων μεγαλύτερων από 0,5 µm. Τα μικρότερα σωματίδια που ανιχνεύονται — υψηλές μετρήσεις υποδεικνύουν πηγές καύσης."
    },
    "pn10": {
      "label": "PN1.0",
      "description": "Αριθμός σωματιδίων μεγαλύτερων από 1,0 µm."
    },
    "pn25": {
      "label": "PN2.5",
      "description": "Αριθμός σωματιδίων μεγαλύτερων από 2,5 µm."
    },
    "pn40": {
      "label": "PN4.0",
      "description": "Αριθμός σωματιδίων μεγαλύτερων από 4,0 µm."
    },
    "pn100": {
      "label": "PN10",
      "description": "Αριθμός σωματιδίων μεγαλύτερων από 10 µm. Χονδρά σωματίδια όπως σκόνη και γύρη."
    },
    "tps": {
      "label": "Τυπικό Μέγεθος",
      "description": "Το πιο κοινό μέγεθος σωματιδίων στο δείγμα. Βοηθά στον εντοπισμό της πηγής — μικρό (~0,5 µm) υποδηλώνει καύση, μεγάλο (~10 µm) υποδηλώνει σκόνη."
    },
    "battery": {
      "label": "Μπαταρία",
      "description": "Υπολειπόμενη φόρτιση μπαταρίας. Οι αισθητήρες στα καταστήματα Skroutz είναι συνδεδεμένοι, οπότε θα πρέπει να παραμένει υψηλή."
    },
    "rssi": {
      "label": "WiFi RSSI",
      "description": "Ισχύς σήματος WiFi. Πάνω από -50 είναι εξαιρετικό, -50 έως -70 είναι καλό, κάτω από -70 μπορεί να προκαλέσει προβλήματα σύνδεσης."
    },
    "sdCard": {
      "label": "Κάρτα SD",
      "description": "Αν η κάρτα SD είναι παρούσα (1) ή απούσα (0). Χρησιμοποιείται για αποθήκευση δεδομένων εκτός σύνδεσης."
    }
  },
  "about": {
    "title": "Σχετικά με το Soundwatch Athens",
    "backToMap": "← Πίσω στον χάρτη",
    "intro": "Η Αθήνα κατατάσσεται σταθερά ανάμεσα στις πιο θορυβώδεις πρωτεύουσες της Ευρώπης. Η ηχορύπανση είναι μια κρίσιμη αστική πρόκληση με άμεσες επιπτώσεις στη δημόσια υγεία και την ποιότητα ζωής. Παρά την κλίμακα του προβλήματος, η Αθήνα σήμερα δεν διαθέτει ένα δημόσιο, προσβάσιμο δίκτυο παρακολούθησης θορύβου.",
    "mission": "Το Soundwatch Athens καλύπτει αυτό το κενό δημιουργώντας τον πρώτο ζωντανό χάρτη θορύβου της πόλης μέσω ενός δικτύου ~50 αισθητήρων σε φυσικά καταστήματα Skroutz σε όλη την Αθήνα.",
    "howItWorksTitle": "Πώς Λειτουργεί",
    "howItWorks": "Κάθε αισθητήρας μετρά τα επίπεδα θορύβου (σε dBA) τοπικά στη συσκευή και μεταδίδει μόνο την υπολογισμένη τιμή — ποτέ ακατέργαστο ήχο — εξασφαλίζοντας πλήρη ιδιωτικότητα. Τα δεδομένα ρέουν σε πραγματικό χρόνο σε αυτή την πλατφόρμα, όπου απεικονίζονται στον διαδραστικό χάρτη.",
    "openDataTitle": "Ανοιχτά Δεδομένα",
    "openData": "Όλα τα δεδομένα αισθητήρων είναι ελεύθερα διαθέσιμα μέσω του δημόσιου API μας. Οποιοσδήποτε μπορεί να έχει πρόσβαση στα δεδομένα προγραμματιστικά για να δημιουργήσει τα δικά του εργαλεία, να διεξάγει έρευνα ή να υποστηρίξει αλλαγές στη γειτονιά του.",
    "apiEndpoint": "API endpoint:",
    "whoWeAreTitle": "Ποιοι Είμαστε",
    "whoWeAre": "Το Soundwatch Athens δημιουργείται από τη Schema Labs, που χτίζει τεχνολογία που ενισχύει τη δημοκρατία, και το Astylab, έναν κοινοτικό εταίρο που ενεργοποιεί το οικοσύστημά του για αστικό μετασχηματισμό.",
    "technologyTitle": "Τεχνολογία",
    "technology": "Βασισμένο στην ανοιχτού κώδικα πλατφόρμα Smart Citizen Kit. Όλο το λογισμικό που αναπτύχθηκε για το Soundwatch είναι ανοιχτού κώδικα."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/messages/
git commit -m "Add el/en translation files"
```

---

### Task 3: Move Pages Under [locale] and Update Layout

**Files:**
- Move: `src/app/layout.tsx` → `src/app/[locale]/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/[locale]/page.tsx`
- Move: `src/app/about/page.tsx` → `src/app/[locale]/about/page.tsx`
- Move: `src/app/leaderboard/page.tsx` → `src/app/[locale]/leaderboard/page.tsx`
- Move: `src/app/sensors/[id]/page.tsx` → `src/app/[locale]/sensors/[id]/page.tsx`
- Move: `src/app/admin/page.tsx` → `src/app/[locale]/admin/page.tsx`
- Keep: `src/app/globals.css` stays at `src/app/[locale]/globals.css` (moves with layout)
- Keep: `src/app/api/` stays at `src/app/api/` (no locale needed)

- [ ] **Step 1: Create directory structure and move files**

```bash
mkdir -p src/app/\[locale\]/about src/app/\[locale\]/leaderboard src/app/\[locale\]/sensors/\[id\] src/app/\[locale\]/admin

# Move files
mv src/app/layout.tsx src/app/\[locale\]/layout.tsx
mv src/app/page.tsx src/app/\[locale\]/page.tsx
mv src/app/globals.css src/app/\[locale\]/globals.css
mv src/app/about/page.tsx src/app/\[locale\]/about/page.tsx
mv src/app/leaderboard/page.tsx src/app/\[locale\]/leaderboard/page.tsx
mv src/app/sensors/\[id\]/page.tsx src/app/\[locale\]/sensors/\[id\]/page.tsx
mv src/app/admin/page.tsx src/app/\[locale\]/admin/page.tsx

# Remove empty directories
rmdir src/app/about src/app/sensors/\[id\] src/app/sensors src/app/leaderboard
```

- [ ] **Step 2: Update layout.tsx to use next-intl**

Replace `src/app/[locale]/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "greek"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soundwatch Athens",
  description: "Live noise monitoring map for Athens",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "el" | "en")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <Nav />
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Move pages under [locale] segment, add NextIntlClientProvider"
```

---

### Task 4: Update Nav Component

**Files:**
- Modify: `src/components/Nav.tsx`

- [ ] **Step 1: Replace Nav with translated version**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export default function Nav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const links = [
    { href: "/", label: t("map") },
    { href: "/leaderboard", label: t("leaderboard") },
    { href: "/about", label: t("about") },
  ];

  return (
    <nav className="bg-[#1c1917] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-[#fb923c] font-extrabold text-base">
          🔊 Soundwatch
        </Link>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              pathname === link.href
                ? "text-white font-medium"
                : "text-[#d6d3d1] hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <span className="text-[#a8a29e] text-xs">{t("location")}</span>
    </nav>
  );
}
```

- [ ] **Step 2: Create navigation helper**

Create `src/i18n/navigation.ts`:

```typescript
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Nav.tsx src/i18n/navigation.ts
git commit -m "Translate Nav component using next-intl"
```

---

### Task 5: Update MapSection and SensorPreviewPanel

**Files:**
- Modify: `src/components/map/MapSection.tsx`
- Modify: `src/components/map/SensorPreviewPanel.tsx`

- [ ] **Step 1: Update MapSection**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";
import SensorPreviewPanel from "@/components/map/SensorPreviewPanel";

const SensorMap = dynamic(() => import("@/components/map/SensorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-light">
      <span className="text-muted"><LoadingMessage /></span>
    </div>
  ),
});

// Separate component so we can use the hook outside dynamic loading callback
function LoadingMessage() {
  const t = useTranslations("map");
  return <>{t("loading")}</>;
}

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  latestReading: Record<string, unknown> | null;
}

export function MapSection({ sensors }: { sensors: SensorData[] }) {
  const t = useTranslations("map");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);

  return (
    <div className="flex flex-1 flex-col md:flex-row relative overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <SensorMap
          sensors={sensors}
          selectedSensorId={selectedSensor?.id}
          onSensorClick={(sensor) => setSelectedSensor(sensor as SensorData)}
        />

        {selectedSensor && (
          <SensorPreviewPanel
            sensor={selectedSensor}
            onClose={() => setSelectedSensor(null)}
          />
        )}

        {!selectedSensor && (
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-2 rounded-lg font-semibold shadow-lg z-10"
          >
            {showLeaderboard ? t("showMap") : t("leaderboard")}
          </button>
        )}
      </div>
      <aside
        className={`${
          showLeaderboard ? "block" : "hidden"
        } md:block w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-white overflow-y-auto p-4 max-h-[40vh] md:max-h-none`}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted">
            {t("sensorsActive", { count: sensors.length })}
          </span>
          {sensors.some((s) => s.latestReading) && (
            <span className="text-xs text-muted">
              {t("updated", {
                time: new Date(
                  Math.max(
                    ...sensors
                      .filter((s) => s.latestReading?.recordedAt)
                      .map((s) => new Date(s.latestReading!.recordedAt as string).getTime())
                  )
                ).toLocaleTimeString(),
              })}
            </span>
          )}
        </div>

        <h2 className="text-lg font-bold mb-1">{t("noisiestRightNow")}</h2>
        <LeaderboardPanel sensors={sensors} mode="noisiest" limit={5} />

        <Link
          href="/leaderboard"
          className="block text-center text-primary text-sm font-semibold mt-3 hover:underline"
        >
          {t("viewFullLeaderboard")}
        </Link>
      </aside>
    </div>
  );
}
```

Note: The `LoadingMessage` component workaround is needed because `dynamic()`'s loading callback doesn't support hooks. An alternative is to just hardcode the loading text or move it outside.

Actually, simpler approach — just inline the loading text without a hook since it's a minor string:

Replace the `loading` in the `dynamic()` call with a plain `<span>` and no translation (loading states are brief, or use a spinner). OR better: extract the loading div outside:

```tsx
const SensorMap = dynamic(() => import("@/components/map/SensorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-light">
      <span className="text-muted animate-pulse">...</span>
    </div>
  ),
});
```

This avoids the hook-in-callback problem. Use the simpler approach.

- [ ] **Step 2: Update SensorPreviewPanel**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getNoiseLevelColor } from "@/lib/geo";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: Record<string, unknown> | null;
}

interface SensorPreviewPanelProps {
  sensor: SensorData;
  onClose: () => void;
}

export default function SensorPreviewPanel({
  sensor,
  onClose,
}: SensorPreviewPanelProps) {
  const t = useTranslations("sensor");
  const tNoise = useTranslations("noise");

  const dba = sensor.latestReading?.noiseDba as number | null;
  const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";
  const label = dba != null ? getTranslatedNoiseLabel(dba, tNoise) : t("noData");
  const r = sensor.latestReading;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 animate-slide-up">
      <div className="bg-white border-t border-border rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-4 mx-auto max-w-lg">
        <div className="relative mb-3">
          <div className="w-8 h-1 bg-border rounded-full mx-auto" />
          <button
            onClick={onClose}
            className="absolute -top-1 right-0 text-muted hover:text-foreground text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">
              {sensor.name || sensor.deviceId}
            </h3>
            {sensor.address && (
              <p className="text-xs text-muted truncate">{sensor.address}</p>
            )}
          </div>
          <div className="text-right ml-4">
            <p className="text-3xl font-bold" style={{ color }}>
              {dba != null ? dba.toFixed(1) : "—"}
            </p>
            <p className="text-xs font-semibold" style={{ color }}>
              {label} · dBA
            </p>
          </div>
        </div>

        <div className="flex gap-3 text-xs text-muted mb-4 flex-wrap">
          {r?.temperature != null && (
            <span>🌡 {(r.temperature as number).toFixed(1)}°C</span>
          )}
          {r?.humidity != null && (
            <span>💧 {(r.humidity as number).toFixed(1)}%</span>
          )}
          {r?.pm25 != null && (
            <span>🌫 PM2.5: {(r.pm25 as number).toFixed(1)}</span>
          )}
          {r?.uvA != null && (
            <span>☀️ UVA: {(r.uvA as number).toFixed(1)}</span>
          )}
        </div>

        <Link
          href={`/sensors/${sensor.id}`}
          className="block text-center bg-primary text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-dark transition-colors"
        >
          {t("viewDetails")}
        </Link>
      </div>

      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function getTranslatedNoiseLabel(
  dba: number,
  t: (key: string) => string
): string {
  if (dba < 55) return t("quiet");
  if (dba < 65) return t("moderate");
  if (dba < 75) return t("loud");
  return t("veryLoud");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/map/
git commit -m "Translate MapSection and SensorPreviewPanel"
```

---

### Task 6: Update LeaderboardPanel and Leaderboard Page

**Files:**
- Modify: `src/components/leaderboard/LeaderboardPanel.tsx`
- Modify: `src/app/[locale]/leaderboard/page.tsx`

- [ ] **Step 1: Update LeaderboardPanel**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getNoiseLevelColor } from "@/lib/geo";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: Record<string, unknown> | null;
}

interface LeaderboardPanelProps {
  sensors: SensorData[];
  mode?: "noisiest" | "quietest";
  limit?: number;
}

export default function LeaderboardPanel({
  sensors,
  mode = "noisiest",
  limit,
}: LeaderboardPanelProps) {
  const t = useTranslations("leaderboard");
  const tNoise = useTranslations("noise");

  const withNoise = sensors
    .filter((s) => (s.latestReading?.noiseDba as number | undefined) != null)
    .sort((a, b) => {
      const aDb = a.latestReading!.noiseDba as number;
      const bDb = b.latestReading!.noiseDba as number;
      return mode === "noisiest" ? bDb - aDb : aDb - bDb;
    })
    .slice(0, limit);

  return (
    <div className="space-y-1">
      {withNoise.length === 0 && (
        <p className="text-sm text-muted">{t("noData")}</p>
      )}
      {withNoise.map((sensor, i) => {
        const dba = sensor.latestReading!.noiseDba as number;
        const color = getNoiseLevelColor(dba);
        const label = getTranslatedNoiseLabel(dba, tNoise);

        return (
          <Link
            key={sensor.id}
            href={`/sensors/${sensor.id}`}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-light transition-colors"
          >
            <span className="text-lg font-bold text-muted/50 w-6 text-right">
              {i + 1}
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {sensor.name || sensor.deviceId}
              </p>
              {sensor.address && (
                <p className="text-xs text-muted truncate">
                  {sensor.address}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-sm">{dba.toFixed(1)} dBA</p>
              <p className="text-xs font-semibold" style={{ color }}>
                {label}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function getTranslatedNoiseLabel(
  dba: number,
  t: (key: string) => string
): string {
  if (dba < 55) return t("quiet");
  if (dba < 65) return t("moderate");
  if (dba < 75) return t("loud");
  return t("veryLoud");
}
```

- [ ] **Step 2: Update leaderboard page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LeaderboardPanel from "@/components/leaderboard/LeaderboardPanel";

interface SensorData {
  id: string;
  deviceId: string;
  name: string | null;
  address: string | null;
  latestReading: {
    noiseDba: number | null;
  } | null;
}

export default function LeaderboardPage() {
  const t = useTranslations("leaderboard");
  const [sensors, setSensors] = useState<SensorData[]>([]);
  const [mode, setMode] = useState<"noisiest" | "quietest">("noisiest");

  useEffect(() => {
    fetch("/api/sensors")
      .then((r) => r.json())
      .then(setSensors)
      .catch(console.error);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        {t("backToMap")}
      </Link>

      <h1 className="text-3xl font-bold mt-4 mb-2">{t("title")}</h1>
      <p className="text-muted mb-6">{t("subtitle")}</p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode("noisiest")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === "noisiest"
              ? "bg-primary text-white"
              : "bg-light text-muted border border-border hover:bg-white"
          }`}
        >
          {t("noisiest")}
        </button>
        <button
          onClick={() => setMode("quietest")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === "quietest"
              ? "bg-[#22c55e] text-white"
              : "bg-light text-muted border border-border hover:bg-white"
          }`}
        >
          {t("quietest")}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <LeaderboardPanel sensors={sensors} mode={mode} />
      </div>
    </div>
  );
}
```

Note: Add `"backToMap"` key to leaderboard namespace in both JSON files — actually, reuse `sensor.backToMap`. Let me use the `sensor` namespace instead since it already has `backToMap`. Update the page to use `useTranslations("sensor")` for that one key, or add to leaderboard. Simplest: add `"backToMap": "← Back to map"` / `"← Πίσω στον χάρτη"` to the leaderboard namespace in both JSON files.

Add to `en.json` leaderboard: `"backToMap": "← Back to map"`
Add to `el.json` leaderboard: `"backToMap": "← Πίσω στον χάρτη"`

- [ ] **Step 3: Commit**

```bash
git add src/components/leaderboard/ src/app/\[locale\]/leaderboard/ src/messages/
git commit -m "Translate leaderboard page and panel"
```

---

### Task 7: Update Sensor Detail Page and SensorDetailClient

**Files:**
- Modify: `src/app/[locale]/sensors/[id]/page.tsx`
- Modify: `src/components/sensors/SensorDetailClient.tsx`

- [ ] **Step 1: Update sensor detail page**

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SensorDetailClient from "@/components/sensors/SensorDetailClient";

async function getSensor(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/sensors/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getReadings(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${baseUrl}/api/sensors/${id}/readings?from=${from}&limit=5000`,
    { cache: "no-store" }
  );
  if (!res.ok) return { readings: [] };
  return res.json();
}

export default async function SensorDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("sensor");
  const [sensor, readingsData] = await Promise.all([
    getSensor(id),
    getReadings(id),
  ]);

  if (!sensor) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("notFound")}</h1>
          <Link href="/" className="text-primary underline">
            {t("backToMap")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SensorDetailClient
      sensor={sensor}
      initialReadings={readingsData.readings}
    />
  );
}
```

- [ ] **Step 2: Update SensorDetailClient**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { getNoiseLevelColor } from "@/lib/geo";
import { type TimeRange, getTimeRangeFrom, NOISE_METRIC } from "@/lib/metrics";
import { getTranslatedGuidelineBadge } from "@/lib/guidelines";
import TimeRangeSelector from "@/components/sensors/TimeRangeSelector";
import MetricAccordion from "@/components/sensors/MetricAccordion";

const ReadingsChart = dynamic(
  () => import("@/components/sensors/ReadingsChart"),
  { ssr: false }
);

interface SensorDetailClientProps {
  sensor: Record<string, unknown> & {
    id: string;
    deviceId: string;
    name: string | null;
    address: string | null;
    firmwareVersion: string | null;
    readingIntervalS: number;
    lastSeenAt: string | null;
    latitude: number | null;
    longitude: number | null;
    latestReading: Record<string, unknown> | null;
  };
  initialReadings: Record<string, unknown>[];
}

export default function SensorDetailClient({
  sensor,
  initialReadings,
}: SensorDetailClientProps) {
  const t = useTranslations("sensor");
  const tNoise = useTranslations("noise");
  const tMetrics = useTranslations("metrics");
  const tGuidelines = useTranslations("guidelines");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [readings, setReadings] = useState(initialReadings);

  useEffect(() => {
    const from = getTimeRangeFrom(timeRange).toISOString();
    fetch(`/api/sensors/${sensor.id}/readings?from=${from}&limit=5000`)
      .then((r) => r.json())
      .then((data) => setReadings(data.readings))
      .catch(console.error);
  }, [timeRange, sensor.id]);

  const dba = sensor.latestReading?.noiseDba as number | null;
  const color = dba != null ? getNoiseLevelColor(dba) : "#a8a29e";
  const label = dba != null ? getTranslatedNoiseLabel(dba, tNoise) : t("noData");

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        {t("backToMap")}
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          {sensor.name || sensor.deviceId}
        </h1>
        {sensor.address && (
          <p className="text-muted mt-1">{sensor.address}</p>
        )}
      </div>

      {/* Noise hero */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-4xl font-bold" style={{ color }}>
            {dba != null ? dba.toFixed(1) : "—"}
          </span>
          <span className="text-muted">dBA</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: color, color: "white" }}
          >
            {label}
          </span>
          {(() => {
            const badge = getTranslatedGuidelineBadge(dba, "noiseDba", tGuidelines);
            return badge ? (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: badge.color + "18",
                  color: badge.color,
                }}
              >
                {badge.text}
              </span>
            ) : null;
          })()}
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>
      <p className="text-xs text-muted mb-4">{tMetrics("noiseDba.description")}</p>

      {/* Noise chart */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <ReadingsChart readings={readings} metricKey="noiseDba" height={280} />
      </div>

      {/* Secondary metrics accordion */}
      <div className="mb-6">
        <MetricAccordion
          latestReading={sensor.latestReading}
          readings={readings}
        />
      </div>

      {/* Sensor info */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-bold mb-4">{t("info")}</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <dt className="text-muted">{t("deviceId")}</dt>
          <dd className="font-mono">{sensor.deviceId}</dd>
          <dt className="text-muted">{t("firmware")}</dt>
          <dd>{sensor.firmwareVersion || "—"}</dd>
          <dt className="text-muted">{t("readingInterval")}</dt>
          <dd>{sensor.readingIntervalS}s</dd>
          <dt className="text-muted">{t("lastSeen")}</dt>
          <dd>
            {sensor.lastSeenAt
              ? new Date(sensor.lastSeenAt).toLocaleString()
              : t("never")}
          </dd>
          <dt className="text-muted">{t("coordinates")}</dt>
          <dd>
            {sensor.latitude != null && sensor.longitude != null
              ? `${sensor.latitude.toFixed(4)}, ${sensor.longitude.toFixed(4)}`
              : "—"}
          </dd>
        </dl>
      </div>
    </div>
  );
}

function getTranslatedNoiseLabel(
  dba: number,
  t: (key: string) => string
): string {
  if (dba < 55) return t("quiet");
  if (dba < 65) return t("moderate");
  if (dba < 75) return t("loud");
  return t("veryLoud");
}
```

- [ ] **Step 3: Create guidelines helper**

Create `src/lib/guidelines.ts`:

```typescript
import { getMetricDef } from "./metrics";

export function getTranslatedGuidelineBadge(
  value: number | null | undefined,
  key: string,
  t: (key: string, values?: Record<string, string | number>) => string
): { text: string; color: string } | null {
  if (value == null) return null;
  const def = getMetricDef(key);
  if (!def?.guideline) return null;

  const { value: limit, source, compare } = def.guideline;
  const displayValue = key === "pressurePa" ? value / 1000 : value;

  if (compare === "below") {
    if (displayValue <= limit) {
      return {
        text: t("within", { source, value: limit, unit: def.unit }),
        color: "#22c55e",
      };
    }
    const ratio = displayValue / limit;
    if (ratio <= 2) {
      return {
        text: t("above", { source, value: limit, unit: def.unit }),
        color: "#f97316",
      };
    }
    return {
      text: t("times", { ratio: ratio.toFixed(1), source, value: limit, unit: def.unit }),
      color: "#ef4444",
    };
  }

  return null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\[locale\]/sensors/ src/components/sensors/SensorDetailClient.tsx src/lib/guidelines.ts
git commit -m "Translate sensor detail page"
```

---

### Task 8: Update MetricAccordion

**Files:**
- Modify: `src/components/sensors/MetricAccordion.tsx`

- [ ] **Step 1: Update MetricAccordion to use translations**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  METRIC_GROUPS,
  formatMetricValue,
  getMetricUnit,
  type MetricGroupDef,
} from "@/lib/metrics";
import { getTranslatedGuidelineBadge } from "@/lib/guidelines";

const ReadingsChart = dynamic(
  () => import("@/components/sensors/ReadingsChart"),
  { ssr: false }
);

interface MetricAccordionProps {
  latestReading: Record<string, unknown> | null;
  readings: Record<string, unknown>[];
}

export default function MetricAccordion({
  latestReading,
  readings,
}: MetricAccordionProps) {
  const tMetrics = useTranslations("metrics");
  const tGuidelines = useTranslations("guidelines");
  const tSensor = useTranslations("sensor");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<
    Record<string, string>
  >({});
  const [showInfo, setShowInfo] = useState<string | null>(null);

  function toggleGroup(groupId: string) {
    setExpandedGroup(expandedGroup === groupId ? null : groupId);
    setShowInfo(null);
  }

  function selectMetric(groupId: string, metricKey: string) {
    setSelectedMetrics((prev) => ({ ...prev, [groupId]: metricKey }));
    setShowInfo(null);
  }

  function getSelectedMetric(group: MetricGroupDef): string {
    return selectedMetrics[group.id] ?? group.metrics[0].key;
  }

  function getSummaryValue(group: MetricGroupDef): string {
    if (!latestReading) return "—";
    const key = group.summaryMetric;
    const value = latestReading[key] as number | null;
    const formatted = formatMetricValue(value, key);
    const unit = getMetricUnit(key);
    return `${formatted} ${unit}`.trim();
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {METRIC_GROUPS.map((group) => {
        const isExpanded = expandedGroup === group.id;
        const activeMetricKey = getSelectedMetric(group);
        const activeMetric = group.metrics.find(
          (m) => m.key === activeMetricKey
        )!;
        const currentValue = latestReading
          ? (latestReading[activeMetricKey] as number | null)
          : null;
        const badge = getTranslatedGuidelineBadge(currentValue, activeMetricKey, tGuidelines);

        return (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className={`w-full px-4 py-3 flex items-center justify-between text-left border-b border-border transition-colors ${
                isExpanded ? "bg-light" : "hover:bg-light/50"
              }`}
            >
              <span
                className={`font-semibold text-sm ${
                  isExpanded ? "text-primary" : ""
                }`}
              >
                {group.icon} {tMetrics(`${group.id}.label`)}
              </span>
              <span className="text-xs text-muted">
                {!isExpanded && (
                  <>
                    {tMetrics(`${group.summaryMetric}.label`)}: {getSummaryValue(group)}{" "}
                  </>
                )}
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>

            {isExpanded && (
              <div className="p-4 border-b border-border bg-white">
                <p className="text-xs text-muted mb-3">
                  {tMetrics(`${group.id}.description`)}
                </p>

                <div className="flex gap-2 mb-4 flex-wrap">
                  {group.metrics.map((metric) => (
                    <button
                      key={metric.key}
                      onClick={() => selectMetric(group.id, metric.key)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        activeMetricKey === metric.key
                          ? "bg-primary text-white"
                          : "bg-light text-muted hover:text-foreground"
                      }`}
                    >
                      {tMetrics(`${metric.key}.label`)}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">
                      {formatMetricValue(currentValue, activeMetricKey)}
                    </span>
                    <span className="text-sm text-muted">
                      {activeMetric.unit}
                    </span>
                  </div>

                  {badge && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: badge.color + "18",
                        color: badge.color,
                      }}
                    >
                      {badge.text}
                    </span>
                  )}

                  <button
                    onClick={() =>
                      setShowInfo(
                        showInfo === activeMetricKey ? null : activeMetricKey
                      )
                    }
                    className="text-muted hover:text-foreground transition-colors text-sm"
                    title={tSensor("whatIsThis")}
                  >
                    ℹ️
                  </button>
                </div>

                {showInfo === activeMetricKey && (
                  <div className="bg-light border border-border rounded-lg p-3 mb-3 text-xs text-muted leading-relaxed">
                    {tMetrics(`${activeMetricKey}.description`)}
                  </div>
                )}

                <ReadingsChart
                  readings={readings}
                  metricKey={activeMetricKey}
                  height={200}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sensors/MetricAccordion.tsx
git commit -m "Translate MetricAccordion"
```

---

### Task 9: Update About Page

**Files:**
- Modify: `src/app/[locale]/about/page.tsx`

- [ ] **Step 1: Rewrite about page with translations**

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        {t("backToMap")}
      </Link>

      <h1 className="text-3xl font-bold mt-4 mb-6">{t("title")}</h1>

      <div className="space-y-6 text-[15px] leading-relaxed">
        <p>{t("intro")}</p>

        <p>
          <strong>{t("mission")}</strong>
        </p>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("howItWorksTitle")}</h2>
          <p>{t("howItWorks")}</p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("openDataTitle")}</h2>
          <p>{t("openData")}</p>
          <p className="mt-2">
            {t("apiEndpoint")}{" "}
            <code className="bg-light border border-border px-2 py-0.5 rounded text-sm font-mono">
              /api/sensors
            </code>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("whoWeAreTitle")}</h2>
          <p>{t("whoWeAre")}</p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("technologyTitle")}</h2>
          <p>
            {t("technology")}{" "}
            <a
              href="https://smartcitizen.me"
              className="text-primary underline hover:text-primary-dark"
              target="_blank"
              rel="noopener noreferrer"
            >
              Smart Citizen Kit
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

Note: The about page `technology` text in the JSON already mentions "Smart Citizen Kit" but the link needs to be separate. Adjust the JSON `technology` value to not include "Smart Citizen Kit" text since we render it as a link. Update both JSONs:

- `en.json`: `"technology": "Built on the open-source {link} platform. All software developed for Soundwatch is open source."`

Actually, next-intl supports rich text. Simpler: just split the text around the link in the component as shown above, keeping the JSON text as the full sentence and handling the link in the component. Let me adjust — keep the JSON as-is and render the link separately:

Update `en.json` `about.technology`: `"Built on the open-source"` + link rendered in JSX + `"platform. All software developed for Soundwatch is open source."`

Simplest approach: split into two keys:
- `"technologyBefore": "Built on the open-source"`  
- `"technologyAfter": "platform. All software developed for Soundwatch is open source."`

Or use next-intl's rich text feature. Let's use rich text:

In the JSON:
```json
"technology": "Built on the open-source <link>Smart Citizen Kit</link> platform. All software developed for Soundwatch is open source."
```

In the component:
```tsx
<p>
  {t.rich("technology", {
    link: (chunks) => (
      <a
        href="https://smartcitizen.me"
        className="text-primary underline hover:text-primary-dark"
        target="_blank"
        rel="noopener noreferrer"
      >
        {chunks}
      </a>
    ),
  })}
</p>
```

Update both JSON files to use this format for the `technology` key.

- [ ] **Step 2: Update JSON files for rich text in technology**

In `en.json`, change `about.technology` to:
```
"Built on the open-source <link>Smart Citizen Kit</link> platform. All software developed for Soundwatch is open source."
```

In `el.json`, change `about.technology` to:
```
"Βασισμένο στην ανοιχτού κώδικα πλατφόρμα <link>Smart Citizen Kit</link>. Όλο το λογισμικό που αναπτύχθηκε για το Soundwatch είναι ανοιχτού κώδικα."
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\[locale\]/about/ src/messages/
git commit -m "Translate about page"
```

---

### Task 10: Clean Up geo.ts and Remove Unused getNoiseLevelLabel

**Files:**
- Modify: `src/lib/geo.ts`

- [ ] **Step 1: Remove getNoiseLevelLabel from geo.ts**

The `getNoiseLevelLabel` function is now replaced by `getTranslatedNoiseLabel` in the components. Remove it from `geo.ts`:

```typescript
// Athens center coordinates
export const ATHENS_CENTER = {
  lng: 23.7275,
  lat: 37.9838,
} as const;

export const ATHENS_ZOOM = 12;

export type NoiseLevel = "quiet" | "moderate" | "loud" | "very_loud";

export function getNoiseLevel(dba: number): NoiseLevel {
  if (dba < 55) return "quiet";
  if (dba < 65) return "moderate";
  if (dba < 75) return "loud";
  return "very_loud";
}

export function getNoiseLevelColor(dba: number): string {
  const level = getNoiseLevel(dba);
  switch (level) {
    case "quiet":
      return "#22c55e";
    case "moderate":
      return "#eab308";
    case "loud":
      return "#f97316";
    case "very_loud":
      return "#ef4444";
  }
}
```

- [ ] **Step 2: Remove getNoiseLevelLabel imports from all files**

Search for any remaining imports of `getNoiseLevelLabel` and remove them. The components now use the local `getTranslatedNoiseLabel` helper. Files to check:
- `src/components/map/SensorPreviewPanel.tsx` — already updated
- `src/components/leaderboard/LeaderboardPanel.tsx` — already updated
- `src/components/sensors/SensorDetailClient.tsx` — already updated

- [ ] **Step 3: Commit**

```bash
git add src/lib/geo.ts
git commit -m "Remove getNoiseLevelLabel, replaced by translated version"
```

---

### Task 11: Remove Display Strings from metrics.ts

**Files:**
- Modify: `src/lib/metrics.ts`

- [ ] **Step 1: Strip label and description from metric definitions**

The `label` and `description` fields are now in the JSON translations. Keep only data fields (key, unit, color, decimals, guideline) in the TypeScript definitions:

```typescript
export interface MetricDef {
  key: string;
  unit: string;
  color: string;
  decimals?: number;
  guideline?: { value: number; source: string; compare: "below" | "above" };
}

export interface MetricGroupDef {
  id: string;
  icon: string;
  summaryMetric: string;
  metrics: MetricDef[];
}

export const METRIC_GROUPS: MetricGroupDef[] = [
  {
    id: "environment",
    icon: "🌡",
    summaryMetric: "temperature",
    metrics: [
      { key: "temperature", unit: "°C", color: "#fb923c" },
      { key: "humidity", unit: "%", color: "#0d9488" },
      { key: "lightLux", unit: "lux", color: "#eab308", decimals: 0 },
      { key: "pressurePa", unit: "kPa", color: "#6366f1", decimals: 2 },
    ],
  },
  {
    id: "airQuality",
    icon: "🌫",
    summaryMetric: "pm25",
    metrics: [
      { key: "pm1", unit: "µg/m³", color: "#f97316" },
      { key: "pm25", unit: "µg/m³", color: "#ef4444", guideline: { value: 15, source: "WHO 24h", compare: "below" } },
      { key: "pm4", unit: "µg/m³", color: "#dc2626" },
      { key: "pm10", unit: "µg/m³", color: "#b91c1c", guideline: { value: 45, source: "WHO 24h", compare: "below" } },
    ],
  },
  {
    id: "uv",
    icon: "☀️",
    summaryMetric: "uvA",
    metrics: [
      { key: "uvA", unit: "µW/cm²", color: "#a855f7" },
      { key: "uvB", unit: "µW/cm²", color: "#7c3aed" },
      { key: "uvC", unit: "µW/cm²", color: "#6d28d9" },
    ],
  },
  {
    id: "particleCounts",
    icon: "🔬",
    summaryMetric: "pn25",
    metrics: [
      { key: "pn05", unit: "#/0.1L", color: "#06b6d4", decimals: 0 },
      { key: "pn10", unit: "#/0.1L", color: "#0891b2", decimals: 0 },
      { key: "pn25", unit: "#/0.1L", color: "#0e7490", decimals: 0 },
      { key: "pn40", unit: "#/0.1L", color: "#155e75", decimals: 0 },
      { key: "pn100", unit: "#/0.1L", color: "#164e63", decimals: 0 },
      { key: "tps", unit: "µm", color: "#0d9488" },
    ],
  },
  {
    id: "health",
    icon: "🔋",
    summaryMetric: "battery",
    metrics: [
      { key: "battery", unit: "%", color: "#22c55e", decimals: 0 },
      { key: "rssi", unit: "dBm", color: "#3b82f6", decimals: 0 },
      { key: "sdCard", unit: "", color: "#78716c", decimals: 0 },
    ],
  },
];

export const NOISE_METRIC: MetricDef = {
  key: "noiseDba",
  unit: "dBA",
  color: "#c2410c",
  guideline: { value: 70, source: "WHO", compare: "below" },
};

export function getMetricDef(key: string): MetricDef | undefined {
  for (const group of METRIC_GROUPS) {
    const found = group.metrics.find((m) => m.key === key);
    if (found) return found;
  }
  if (key === "noiseDba") return NOISE_METRIC;
  return undefined;
}

export function formatMetricValue(
  value: number | null | undefined,
  key: string
): string {
  if (value == null) return "—";
  const def = getMetricDef(key);
  const decimals = def?.decimals ?? 1;
  if (key === "pressurePa") return (value / 1000).toFixed(decimals);
  return value.toFixed(decimals);
}

export function getMetricUnit(key: string): string {
  return getMetricDef(key)?.unit ?? "";
}

export type TimeRange = "24h" | "7d" | "30d";

export function getTimeRangeFrom(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}
```

- [ ] **Step 2: Remove getGuidelineBadge export usage**

The old `getGuidelineBadge` function from metrics.ts is now replaced by `getTranslatedGuidelineBadge` from `src/lib/guidelines.ts`. Remove the old function from metrics.ts (it's already gone in the rewrite above).

- [ ] **Step 3: Commit**

```bash
git add src/lib/metrics.ts
git commit -m "Remove display strings from metrics, keep only data"
```

---

### Task 12: Verify Build and Fix Issues

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds. If there are errors, they'll likely be:
- Missing imports (fix the specific import)
- Type mismatches from removed `label`/`description` fields (update types)

- [ ] **Step 2: Fix any remaining issues**

Common fixes needed:
- If `SensorMap.tsx` imports `getNoiseLevelLabel` — remove it (the map markers use color only, not text labels)
- Ensure `src/app/admin/page.tsx` still works — admin page stays as-is (English-only internal tool is fine, or translate if needed)

- [ ] **Step 3: Run dev server and test both locales**

```bash
npm run dev
```

Test:
- `http://localhost:3000/` — should load Greek
- `http://localhost:3000/en` — should load English
- Navigate between pages, verify translations appear

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix build issues from i18n migration"
```

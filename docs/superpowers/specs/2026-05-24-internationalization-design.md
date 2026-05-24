# Internationalization Design

## Overview

Add i18n to Soundwatch Athens using `next-intl`. Greek is the default language (no URL prefix), English is available at `/en/...`.

## Routing

- `/`, `/about`, `/leaderboard`, `/sensors/123` — Greek (default)
- `/en/`, `/en/about`, `/en/leaderboard`, `/en/sensors/123` — English
- No language switcher UI; users navigate via URL only

## Library

**`next-intl`** with App Router integration.

Key config: `defaultLocale: 'el'`, `locales: ['el', 'en']`, `localePrefix: 'as-needed'` (hides `/el` prefix, shows `/en`).

## File Structure

```
src/
  i18n/
    routing.ts          # defineRouting() — locales, default, prefix strategy
    request.ts          # getRequestConfig() — loads messages for server components
  messages/
    el.json             # Greek translations
    en.json             # English translations
  middleware.ts         # next-intl middleware for locale detection
  app/
    [locale]/           # dynamic segment wrapping all pages
      layout.tsx        # root layout with dynamic lang attribute
      page.tsx          # home/map page
      about/page.tsx
      leaderboard/page.tsx
      sensors/[id]/page.tsx
      admin/page.tsx
    api/                # API routes stay outside [locale] — no translation needed
```

## Translation JSON Structure

```json
{
  "nav": {
    "map": "...",
    "leaderboard": "...",
    "about": "..."
  },
  "map": {
    "loading": "...",
    "sensorsActive": "...",
    "updated": "...",
    "noData": "..."
  },
  "leaderboard": {
    "title": "...",
    "noisiest": "...",
    "quietest": "...",
    "viewAll": "..."
  },
  "sensor": {
    "info": "...",
    "deviceId": "...",
    "firmware": "...",
    "readingInterval": "...",
    "location": "...",
    "noReadings": "..."
  },
  "metrics": {
    "temperature": { "label": "...", "description": "..." },
    "humidity": { "label": "...", "description": "..." }
  },
  "about": {
    "title": "...",
    "intro": "...",
    "technology": "...",
    "team": "...",
    "openSource": "..."
  }
}
```

The `en.json` file is the current English content. The `el.json` file is the Greek translation of all keys.

## Implementation Details

### Middleware (`src/middleware.ts`)

Uses `createMiddleware` from `next-intl/middleware` with the routing config. Handles locale detection from URL path. Falls back to Greek for unrecognized paths.

### Server Components

Use `getTranslations()` from `next-intl/server` to get a namespaced `t()` function:

```tsx
const t = await getTranslations('nav');
return <span>{t('map')}</span>;
```

### Client Components

Use `useTranslations()` hook:

```tsx
const t = useTranslations('map');
return <p>{t('loading')}</p>;
```

### Metrics (`src/lib/metrics.ts`)

The metrics module currently exports display strings (labels, descriptions, guidelines). After i18n:

- The module keeps metric IDs, units, thresholds, and WHO guideline values (data, not display)
- Display strings (label, description, guideline text) move to `metrics.*` namespace in the JSON files
- Components look up display text via `t(`metrics.${metricId}.label`)` pattern

### Root Layout

Moves to `src/app/[locale]/layout.tsx`. Sets `<html lang={locale}>` dynamically. Wraps children with `NextIntlClientProvider` for client component translations.

### API Routes

Stay outside `[locale]/` — they return JSON data, not UI text. No changes needed.

### Navigation Links

Internal links use `next-intl`'s `<Link>` component which automatically prepends the locale prefix when needed.

## Files Requiring Changes

| File | Change |
|------|--------|
| `package.json` | Add `next-intl` dependency |
| `next.config.ts` | Add `createNextIntlPlugin` wrapper |
| `src/middleware.ts` | Create with next-intl middleware |
| `src/i18n/routing.ts` | Create routing config |
| `src/i18n/request.ts` | Create request config |
| `src/messages/el.json` | Create Greek translations |
| `src/messages/en.json` | Create English translations (current text) |
| `src/app/layout.tsx` | Move to `[locale]/layout.tsx`, add provider |
| `src/app/page.tsx` | Move to `[locale]/page.tsx`, use translations |
| `src/app/about/page.tsx` | Move to `[locale]/about/page.tsx`, use translations |
| `src/app/leaderboard/page.tsx` | Move to `[locale]/leaderboard/page.tsx` |
| `src/app/sensors/[id]/page.tsx` | Move to `[locale]/sensors/[id]/page.tsx` |
| `src/app/admin/page.tsx` | Move to `[locale]/admin/page.tsx` |
| `src/components/Nav.tsx` | Replace hardcoded strings with `useTranslations` |
| `src/components/map/MapSection.tsx` | Replace hardcoded strings |
| `src/components/map/SensorPreviewPanel.tsx` | Replace hardcoded strings |
| `src/components/leaderboard/LeaderboardPanel.tsx` | Replace hardcoded strings |
| `src/components/sensors/SensorDetailClient.tsx` | Replace hardcoded strings |
| `src/components/sensors/MetricAccordion.tsx` | Replace hardcoded strings |
| `src/lib/metrics.ts` | Remove display strings, keep data only |

## Out of Scope

- Language switcher UI (not needed per requirements)
- Auto-detection from browser `Accept-Language` header
- RTL support
- CMS-driven translations
- Translated URLs/slugs (e.g., `/en/about` stays as-is, not `/el/sxetika`)

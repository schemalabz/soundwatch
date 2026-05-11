# Soundwatch Athens — Visual Identity & Design System

## Direction

Warm & approachable. Community-oriented, inviting, earthy. The platform should feel like a neighborhood tool anyone can use, not a cold data portal. Inspired by Athenian architecture — clay rooftops, terracotta, Mediterranean warmth.

## Color Palette

### Brand Colors

| Role         | Hex       | Usage                                    |
|-------------|-----------|------------------------------------------|
| Primary     | `#c2410c` | Buttons, links, active states, brand     |
| Primary Dark| `#7c2d12` | Hover states, headings, emphasis         |
| Accent      | `#fb923c` | Logo accent, highlights, secondary CTA   |
| Light       | `#fff7ed` | Card backgrounds, light fills, badges    |
| Background  | `#faf5ef` | Page background                          |
| Text        | `#1c1917` | Primary text, headings                   |
| Muted       | `#78716c` | Secondary text, labels, timestamps       |
| Border      | `#e7e0d5` | Card borders, dividers, separators       |

### Noise Level Colors (fixed, universal scale)

| Level      | Hex       | Range      |
|-----------|-----------|------------|
| Quiet      | `#22c55e` | < 55 dBA   |
| Moderate   | `#eab308` | 55–65 dBA  |
| Loud       | `#f97316` | 65–75 dBA  |
| Very Loud  | `#ef4444` | > 75 dBA   |

These remain constant regardless of theme — they're a universal scale users already understand.

## Typography

Use the existing Geist font family (already in the project via Next.js):
- **Geist Sans** — all UI text
- **Geist Mono** — device IDs, technical data, API references

Sizes follow Tailwind defaults. Key usage:
- Page titles: `text-3xl font-bold` in `#1c1917`
- Section headings: `text-lg font-bold` in `#1c1917`
- Body text: `text-sm` in `#1c1917`
- Secondary/labels: `text-xs` or `text-sm` in `#78716c`
- Large metric values: `text-2xl font-bold` (color from noise level)

## Map

- **Style**: `mapbox://styles/mapbox/streets-v12`
- **Sensor markers**: Circular, 24px, filled with noise level color, white 3px border, drop shadow
- **Popup**: White card with sensor name, current dBA (bold, colored), link to detail page

## Components

### Navigation Bar

Dark background (`#1c1917`) with:
- Logo/brand name in accent color (`#fb923c`), bold
- Nav links in `#d6d3d1`, hover to white
- Subtle location indicator ("Athens, Greece") in `#a8a29e`

### Sensor Cards

Used on sensor detail page for current readings:
- Background: `#faf5ef`
- Border: `1px solid #e7e0d5`
- Border radius: `12px`
- Noise level dot (10px circle) + location label in muted
- Large metric value in text color, noise level label colored

### Leaderboard Rows

- White background, `#e7e0d5` border
- Rounded container (`12px`)
- Each row: rank number (muted), noise dot, sensor name + address, dBA value + level label
- Rows separated by `#f0ebe3` dividers
- Hover: `bg-gray-50` (subtle)

### Buttons

- **Primary**: `#c2410c` background, white text, `8px` radius
- **Secondary**: `#fff7ed` background, `#c2410c` text, `1px solid #fed7aa` border
- **Link**: No background, `#c2410c` text, underline

### Noise Level Badges

Inline pill badges: colored background, white text, `6px` radius, `11px` font, bold.

## Page Backgrounds

All pages use `#faf5ef` as the base background color. Cards and content areas use white or `#faf5ef`.

## Scope

- Light mode only for v1
- No dark mode (can be added later as a separate task)
- Map style is a built-in Mapbox style (no custom style needed)

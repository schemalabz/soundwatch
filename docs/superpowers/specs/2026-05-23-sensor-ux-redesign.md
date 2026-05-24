# Soundwatch — Sensor UX Redesign

## Overview

Redesign the sensor interaction flow: map preview panel, chart-first sensor detail page, and expandable secondary metrics with historical charts.

## 1. Map — Slide-Up Preview Panel

When a user clicks a sensor marker on the map, a card slides up from the bottom of the map.

### Content

- **Drag handle** — visual indicator at the top
- **Sensor name** (bold) and address (muted)
- **Current noise level** — large dBA value, colored by noise level, with level badge (Quiet/Moderate/Loud/Very Loud)
- **Key metrics summary** — temperature, humidity, PM2.5, UVA as inline compact values
- **"View details →" button** — primary terracotta button, links to `/sensors/:id`

### Behavior

- Clicking a marker opens the panel (or swaps to the new sensor if already open)
- Clicking the map background dismisses the panel
- On mobile: panel takes bottom ~40% of screen
- On desktop: panel is fixed width (~400px) centered at bottom of map area
- Replaces the current Mapbox popup entirely

## 2. Sensor Detail Page — Chart-First Layout

### Hero Section

- Back link ("← Back to map")
- Sensor name (large, bold) and address (muted)
- Current noise value: **large** (36px+), colored by level, with level badge
- **Time range selector**: tabs for 24h / 7d / 30d — controls all charts on the page
- **Noise historical chart**: large Recharts line chart, terracotta line, takes full width

### Secondary Metrics — Accordion

Below the noise chart, an accordion with 5 groups. Only one group can be expanded at a time.

#### Groups

| Group | Metrics | Summary (when collapsed) |
|-------|---------|--------------------------|
| Environment | Temperature (°C), Humidity (%), Light (lux), Pressure (kPa) | Temperature value |
| Air Quality | PM1, PM2.5, PM4, PM10 (µg/m³) | PM2.5 value |
| UV Radiation | UVA, UVB, UVC (µW/cm²) | UVA value |
| Particle Counts | PN0.5, PN1.0, PN2.5, PN4.0, PN10 (#/0.1L), Typical Size (µm) | PN2.5 value |
| Sensor Health | Battery (%), WiFi RSSI (dBm), SD Card | Battery value |

#### Expanded Group

When a group is expanded:

- **Metric tabs** — pill-style tabs for each metric in the group. Active tab is terracotta, others are muted.
- **Current value** — large value + unit for the selected metric
- **Historical chart** — same Recharts line chart component, same time range as the noise chart above

Clicking a different metric tab swaps the value and chart. Clicking a different group collapses the current one and expands the new one.

### Sensor Info

Compact section at the bottom with: Device ID, firmware version, reading interval, last seen, coordinates. Same as current.

## 3. Time Range Selector

Three tabs: **24h** (default), **7d**, **30d**. Applies globally to all charts on the page (noise + any expanded secondary metric). The readings API already supports `from`/`to` query params.

## 4. Mobile Considerations

- Hero noise value and chart stack vertically (already responsive)
- Accordion groups are full width
- Metric tabs inside groups wrap on narrow screens
- Sensor info section stacks to single column

## Components

### New

- `SensorPreviewPanel` — slide-up map panel (client component)
- `MetricAccordion` — accordion container (client component)
- `MetricGroup` — single expandable group with metric tabs + chart
- `TimeRangeSelector` — 24h/7d/30d tab bar

### Modified

- `SensorMap` — replace Mapbox popup with `SensorPreviewPanel`
- `MapSection` — handle selected sensor state
- `ReadingsChart` — accept any metric key, not just the three currently supported
- Sensor detail page (`/sensors/[id]/page.tsx`) — complete rewrite

### Removed

- `SensorChartSection` — replaced by inline chart in the new layout
- Current `MetricCard` / `MetricGroup` components in the sensor detail page

## API Changes

None. The existing `GET /api/sensors/:id/readings?from=...&to=...&limit=...` endpoint already returns all metrics and supports time range filtering.

## Out of Scope

- Real-time live updates (polling/SSE) — future improvement
- Comparing metrics across sensors — future improvement
- Data export from charts — future improvement

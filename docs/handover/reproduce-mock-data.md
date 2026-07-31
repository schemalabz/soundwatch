# Guide: reproduce the dashboard mock data

How to regenerate `src/lib/soundwatchMock.json` — the dataset-grounded mock the
redesigned dashboard renders — from UrbanSound8K, end to end. Uses the **4-label
taxonomy** (`siren, dog_bark, engine_idling, constructions`).

```
UrbanSound8K audio ──reduce──▶ bands.csv ──build──▶ soundwatchMock.json ──▶ UI
   (minimal_bands.py:          (+ class    (masks + classify + curves)
    sound → 7 bands + dBA)      labels)
```

All scripts live in `scripts/soundbands/`.

---

## What is real vs synthetic

| Real (UrbanSound8K-derived) | Synthetic (a plausible prior) |
|---|---|
| the 7 band values + dBA per clip | the **diurnal / seasonal timing** of the curves |
| per-source band **masks** (mean tilt) | — |
| per-source **loudness** | — |
| the **masking classifier** + its accuracy | — |

UrbanSound8K clips have no time-of-day structure, so the hour/month curves are a
synthetic prior. Replace them with real sensor history once the
mosquitto → ingester → Postgres pipeline is live. Bands are un-equalized and not
SPL-calibrated, so masking uses offset-safe **tilt**; recalibrate with real sensor
recordings before trusting masks in production.

---

## Prerequisites

- **Python 3.10+** and the deps in `scripts/soundbands/requirements.txt`
  (`numpy, scipy, soundfile, pandas`).
- **UrbanSound8K** on disk — see [urbansound8k-dataset.md](urbansound8k-dataset.md).
  Point `scripts/soundbands/data` at your dataset root with a symlink (gitignored), e.g.
  `ln -s ../acoustic-classifier/data scripts/soundbands/data` once UrbanSound8K is placed
  under `scripts/acoustic-classifier/data/`.

```bash
cd scripts/soundbands
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# (the classifier and soundbands share the same deps — one venv can serve both)
```

---

## Step 1 — (optional) sanity-check one clip

```bash
python minimal_bands.py data/UrbanSound8K/audio/fold1/<some>.wav
```

Prints the 7 firmware bands + dBA for one file. `minimal_bands.py` is the **canonical,
sensor-faithful** DSP, shared verbatim with `scripts/acoustic-classifier`.

## Step 2 — audio → 7-band CSV (`bands.csv`)

```bash
python reduce_urbansound.py --dataset data/UrbanSound8K --out bands.csv
# quick smoke run: add --limit 10  (max clips per fold)
```

Slices every clip into 1-second chunks (~86 × 512-sample frames @ 44.1 kHz, matching the
sensor's 1 s reading cadence) and writes **one row per second**:
`seq, file, fold, class, second, noise_dba, noise_low … noise_8k`.

> **`bands.csv` is class-agnostic** — it contains *all* UrbanSound8K classes with their
> labels (~32k rows, ~2.8 MB, already committed). It does **not** need regenerating when
> only the 4-label mapping changes — that mapping is applied in Step 3. Regenerate it only
> if the DSP or dataset changes (~a few minutes over the full dataset).

## Step 3 — masks + classifier + UI mock JSON

```bash
python build_mock.py --bands bands.csv --out ../../src/lib/soundwatchMock.json
```

This is where the **4-label taxonomy** is applied (`CLASS_TO_SOURCE` / `SOURCES` in
`build_mock.py`):

| UrbanSound8K class | UI source |
|---|---|
| `engine_idling` | `engine_idling` |
| `dog_bark` | `dog_bark` |
| `jackhammer`, `drilling` | `constructions` |
| `siren` | `siren` |
| *(all others: air_conditioner, car_horn, street_music, children_playing, gun_shot)* | dropped |

It writes `soundwatchMock.json` with:

- `masks` — per-source mean **tilt** vector across the 7 bands (offset-safe fingerprint).
- `sourceLoudness` — per-source relative energy, normalized 0–1.
- `classifierAccuracy` — accuracy of the simple nearest-mask classifier on tilt
  (currently ~0.63; this is a crude illustrative classifier, **not** the RandomForest in
  `scripts/acoustic-classifier`, which reaches 0.71–0.83 fine accuracy).
- `forecast[day|evening|night]`, `calendar`, `seasons`, `hourly`, `year` — dashboard
  curves = real per-source **loudness** × **synthetic** diurnal/seasonal timing priors
  (`DIURNAL` / `SEASON` in `build_mock.py`). Seeded (`rng = 42`) → deterministic output.

The `seasons` series is the 3-key overlapping subset the Seasons chart draws:
`engine_idling, dog_bark, constructions`.

---

## Step 4 — how it wires into the UI (already wired)

`src/lib/mockData.ts` imports `soundwatchMock.json` and exposes it via `NOISE_SOURCES`,
`forecastData()`, `calendarData()`, `seasonsData()`, `hourlyData()`, `yearData()`.

If you change the **set of sources**, keep these four in sync (all use the same keys):

1. `scripts/soundbands/build_mock.py` — `CLASS_TO_SOURCE`, `SOURCES`, `DIURNAL`, `SEASON`,
   and the `seasons` subset line.
2. `src/lib/mockData.ts` — the `NOISE_SOURCES` array.
3. `src/messages/{en,el}.json` — the `dashboard.sources` label block (and, for the map's
   dominant-sound feature, `dashboard.soundClasses`).
4. `src/components/dashboard/SeasonsChart.tsx` — the hardcoded `SeasonKey` type, `STYLE`,
   `DRAW_ORDER`, `LEGEND`, and `visible` defaults (must match the 3-key `seasons` subset).

`ForecastGrid.tsx` and `NoiseCalendar.tsx` iterate the data generically and only need the
message labels; only `SeasonsChart.tsx` hardcodes source keys.

### Verify

```bash
# from the repo root
npx tsc --noEmit          # types
npm run lint              # eslint
npm test                  # vitest
```

Then run the app (`npm run dev`) and check the dashboard's Forecast, Calendar, Seasons,
By-Hour and Year-at-a-Glance panels render the four sources with correct labels in both
`en` and `el`.

---

## Quick reference — one-shot regeneration

```bash
cd scripts/soundbands
source .venv/bin/activate   # your venv with numpy/scipy/soundfile/pandas
python reduce_urbansound.py --dataset data/UrbanSound8K --out bands.csv   # only if DSP/dataset changed
python build_mock.py --bands bands.csv --out ../../src/lib/soundwatchMock.json
```

# soundbands — realistic band data for the redesign

Turns labeled audio (UrbanSound8K) into the **same 7 frequency bands the physical
sensor emits**, builds per-category **masks**, runs the **masking classifier**, and
generates a **mock JSON** for the dashboard — so the UI shows dataset-grounded
shapes instead of pure random curves.

```
UrbanSound8K audio ──reduce──▶ bands.csv ──build──▶ soundwatchMock.json ──▶ UI
   (minimal_bands.py:          (+labels)   (masks + classify + curves)
    sound → 7 bands + dBA)
```

## Files

| File | What |
|---|---|
| `minimal_bands.py` | canonical sensor-faithful processing: a sound file → 7 bands + dBA (shared with `scripts/acoustic-classifier`) |
| `reduce_urbansound.py` | run `minimal_bands` over the dataset → `bands.csv` |
| `build_mock.py` | `bands.csv` → per-source masks + masking classifier + UI `soundwatchMock.json` |
| `data/` | symlink to the UrbanSound8K root (gitignored) |

## What is real vs synthetic

| Real (dataset-derived) | Synthetic (plausible prior) |
|---|---|
| the 7 band values + dBA per clip | the diurnal / seasonal **timing** of the curves |
| per-source band **masks** | — |
| per-source **loudness** | — |
| the **masking classifier** + accuracy | — |

UrbanSound8K is isolated ~4 s clips with **no time-of-day structure**, so the
dashboard's hour/month curves can only be grounded in real **sensor history**
later (via the mosquitto → ingester → Postgres pipeline). The band fingerprints
and classification transfer to the real sensor. Bands are **un-equalized** and not
SPL-calibrated, so the masking uses offset-safe **tilt** — recalibrate with real
sensor recordings before trusting masks in production.

## Setup & run

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# sanity: one sound file → 7 bands + dBA
python minimal_bands.py data/UrbanSound8K/audio/fold1/<some>.wav

# audio → 7-band CSV  (--limit 10 for a quick smoke run)
python reduce_urbansound.py --dataset data/UrbanSound8K --out bands.csv

# masks + classifier + UI mock JSON
python build_mock.py --bands bands.csv --out ../../src/lib/soundwatchMock.json
```

Symlink `data/` to your UrbanSound8K root (gitignored), e.g. point it at the copy under
`../acoustic-classifier/data` so the classifier and this pipeline share one download.

## Wire into the UI

`build_mock.py` writes `src/lib/soundwatchMock.json` in the shapes `mockData.ts`
already returns (`forecast[period]`, `calendar`, `seasons`, `hourly`, `year`), plus
`masks` + `sourceLoudness` for a future band/classification panel. Minimal
integration: `import mock from "./soundwatchMock.json"` and return `mock.*` instead
of the random generators.

## Category mapping (US8K → the 4 UI sources)

These mirror the `scripts/acoustic-classifier` 4-label taxonomy exactly:

`engine_idling → engine_idling` · `dog_bark → dog_bark` · `jackhammer, drilling →
constructions` · `siren → siren`.

Every other UrbanSound8K class (`air_conditioner, car_horn, street_music,
children_playing, gun_shot`) is **dropped** — it is not one of the four sources.

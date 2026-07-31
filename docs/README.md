# SoundWatch — sound classification & dashboard mock data

Documentation for the acoustic classification work and the dataset-grounded dashboard
mock data.

## The 4-label taxonomy

Everything below reports the **four sound sources** the platform classifies:

| Label | UrbanSound8K source | Notes |
|---|---|---|
| `siren` | `siren` | emergency vehicles |
| `dog_bark` | `dog_bark` | |
| `engine_idling` | `engine_idling` | idling road vehicles |
| `constructions` | `drilling` + `jackhammer` | merged — impulsive power tools |

## Two pieces, one shared DSP

```
                          minimal_bands.py  (shared, sensor-faithful DSP)
                          ┌───────────────┴───────────────┐
   scripts/acoustic-classifier                   scripts/soundbands
   "what should firmware compute?"               "what does the dashboard show?"
   → 10-fold CV, config ablation                 → bands.csv → soundwatchMock.json → UI
```

Both live under `scripts/` in this repo; the 6.6 GB UrbanSound8K dataset is gitignored
and downloaded separately (see [urbansound8k-dataset.md](urbansound8k-dataset.md)).

## Documents

| Doc | What's in it |
|---|---|
| [signal-pipeline.md](signal-pipeline.md) | End-to-end **mermaid diagram**: mic → DSP (DC removal, window, FFT, bands/dBA) → MQTT → mosquitto → ingester → Postgres → classify, and how each stage maps to the code. |
| [acoustic-classifier.md](acoustic-classifier.md) | The classifier tool, the config ablation, and the **4-label results** (baseline 0.705 fine → 0.825 with the full upgrade; temporal features are the biggest, cheapest win). How to reproduce. |
| [urbansound8k-dataset.md](urbansound8k-dataset.md) | The dataset: source, **CC BY-NC 3.0 non-commercial license**, 10 classes / 10 official folds, per-class counts, layout, how to obtain, and the no-time-of-day caveat. |
| [reproduce-mock-data.md](reproduce-mock-data.md) | Step-by-step guide to regenerate `src/lib/soundwatchMock.json` from UrbanSound8K, what's real vs synthetic, and the four files to keep in sync when the source set changes. |

## Layout in this repo

- `scripts/acoustic-classifier/` — the research/ablation tool (emulator, features, RF, 10-fold CV, CLI, tests).
- `scripts/soundbands/` — the mock pipeline (`minimal_bands.py` DSP, `reduce_urbansound.py`, `build_mock.py`).
- `src/lib/soundwatchMock.json` — the generated dashboard mock the UI consumes.
- UrbanSound8K itself is **not** in the repo (6.6 GB, CC BY-NC) — download into `scripts/acoustic-classifier/data/`.

## Key caveats

- The mock data and classifier are built on a **non-commercial** dataset (CC BY-NC 3.0) —
  illustrative/dev only, to be replaced by **real SCK sensor history** (mosquitto →
  ingester → Postgres). Do not ship it as-is commercially.
- Dashboard **band fingerprints and classification are real**; the **diurnal/seasonal
  timing is a synthetic prior** (UrbanSound8K has no time-of-day structure).
- Bands are un-equalized / not SPL-calibrated — masks use offset-safe **tilt**;
  recalibrate against real sensor recordings before trusting them in production.

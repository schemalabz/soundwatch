# Dataset: UrbanSound8K

The labeled audio behind both the classifier results and the dashboard mock data.

- **Home page:** https://urbansounddataset.weebly.com/urbansound8k.html
- **Paper:** J. Salamon, C. Jacoby, J. P. Bello, *"A Dataset and Taxonomy for Urban
  Sound Research"*, 22nd ACM International Conference on Multimedia, Orlando USA, Nov. 2014.
- **Authors:** Music and Audio Research Lab (MARL) + Center for Urban Science and
  Progress (CUSP), New York University.
- **Version:** 1.0

## License — ⚠️ non-commercial

UrbanSound8K is offered **free of charge for non-commercial use only**, under
**Creative Commons Attribution-NonCommercial 3.0 (CC BY-NC 3.0)**.

**Handover implication:** anything derived from it — `bands.csv`, `soundwatchMock.json`,
the trained classifier — inherits the non-commercial restriction and **must not ship in
a commercial product as-is**. It is a development/illustrative stand-in only. The plan is
to replace it with **real SCK sensor history** (via mosquitto → ingester → Postgres) once
that pipeline is live. Academic use must cite the paper above.

Per-file audio is excerpted from recordings on [freesound.org]; per-recording attribution
is in `data/UrbanSound8K/FREESOUNDCREDITS.txt`.

## Contents

- **8732 labeled excerpts** (≤ 4 s each) of urban sound, from field recordings.
- **10 classes:** `air_conditioner, car_horn, children_playing, dog_bark, drilling,
  engine_idling, gun_shot, jackhammer, siren, street_music`.
- **Pre-sorted into 10 folds** (`fold1`…`fold10`). Cross-validation **must** use these
  official folds — slices from the same source recording sit in the same fold, so a
  random split would leak near-duplicates between train and test and inflate accuracy.
- Sample rate / bit depth / channels **vary per file** (they match the original Freesound
  upload). The DSP resamples every clip to a common 44.1 kHz mono before processing.

### Per-class clip counts

| Class | Clips | Used by the 4-label taxonomy? |
|---|---|---|
| air_conditioner | 1000 | no (dropped) |
| car_horn | 429 | no (dropped) |
| children_playing | 1000 | no (dropped) |
| **dog_bark** | 1000 | → `dog_bark` |
| **drilling** | 1000 | → `constructions` |
| **engine_idling** | 1000 | → `engine_idling` |
| gun_shot | 374 | no (dropped) |
| **jackhammer** | 1000 | → `constructions` |
| **siren** | 929 | → `siren` |
| street_music | 1000 | no (dropped) |

The 4-label task uses **4929 clips** (siren 929 + dog_bark 1000 + engine_idling 1000 +
constructions 2000).

## On-disk layout (required)

```
data/UrbanSound8K/
  metadata/UrbanSound8K.csv     # one row per clip
  audio/fold1/ … audio/fold10/  # the .wav excerpts
```

`UrbanSound8K.csv` columns: `slice_file_name, fsID, start, end, salience, fold, classID,
class`. The pipelines join on `fold` + `slice_file_name` and read the `class` column.

## How to obtain it

The dataset sits **behind a free request form** and cannot be auto-downloaded:

1. Request + download the archive from
   https://urbansounddataset.weebly.com/urbansound8k.html
2. Extract so the layout matches the tree above.
3. Place it at `scripts/acoustic-classifier/data/UrbanSound8K` (the classifier's default,
   also overridable with `ACOUSTIC_DATA=/path/to/data`), and symlink
   `scripts/soundbands/data` to the same root so both pipelines share one copy.

Both `data/` paths are **gitignored** — the 6.6 GB of audio is never committed; only the
code and the derived `bands.csv` / `soundwatchMock.json` travel with the repo.

## Important caveat for the dashboard

UrbanSound8K is **isolated ~4 s clips with no time-of-day structure**. It can ground the
*band fingerprints* and *classification* of each sound source, but it says nothing about
**when** sounds occur. So the dashboard's diurnal/seasonal curves are a **synthetic prior**,
not dataset-derived — to be replaced by real sensor history later. See
[reproduce-mock-data.md](reproduce-mock-data.md) for exactly what is real vs synthetic.

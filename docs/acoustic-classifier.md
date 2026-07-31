# Acoustic sensor classifier — 4-label results

The **acoustic classifier** research tool (vendored at `scripts/acoustic-classifier/`)
and the classification results that feed the SoundWatch redesign.

- **Location:** `scripts/acoustic-classifier/` — vendored into this repo, code only (~84 KB).
- **Dataset:** UrbanSound8K is **not** committed (6.6 GB, CC BY-NC). Download it into
  `scripts/acoustic-classifier/data/` (gitignored) — see [urbansound8k-dataset.md](urbansound8k-dataset.md).
- Shares the sensor-faithful DSP (`minimal_bands.py`) with `scripts/soundbands/`.

---

## 1. What the tool is (and is not)

It is an **offline research + decision tool**, **not** firmware. It:

1. **Emulates** the Smart Citizen Kit (SCK) on-device DSP pipeline — it reprocesses
   full-quality audio clips into exactly the band energies the device would publish
   for a given hardware/firmware config (`acoustic/emulator.py`).
2. Trains a sound-source classifier on those **device-realistic** band energies
   (not the original hi-fi audio).
3. Quantifies **how much accuracy each proposed firmware/schema upgrade actually
   buys**, so we can decide what to commit to before touching firmware or the
   Postgres schema.

The classifier here is a prototype of what will eventually run in the backend `CLS`
node.

### The five configs under test (the ablation)

| Config | FFT | Bands | Temporal | What it isolates |
|---|---|---|---|---|
| **A** (baseline) | 512-pt | 7 fixed firmware bands | no | what we ship today |
| **B** | 2048-pt | ~10 octave | no | value of low-freq resolution (real 31.5/63/125 Hz) |
| **C** | 2048-pt | ~27 third-octave | no | value of band count |
| **A+T** | 512-pt | 7 fixed | **yes** | temporal stats on *current* hardware (no FFT change) |
| **B+T** | 2048-pt | ~10 octave | **yes** | the full upgrade |

Evaluation is **10-fold cross-validation over UrbanSound8K's official folds** (never
a random split — that would leak near-duplicate slices between train/test). Model is
a class-balanced RandomForest (seed 1234, deterministic).

---

## 2. The 4-label taxonomy (updated 2026-07-31)

The classification target was changed from the old machinery-only set
(`drilling / jackhammer / engine_idling / air_conditioner`) to the **4 labels the
platform reports**:

| Fine label | UrbanSound8K source class(es) | Clips |
|---|---|---|
| `siren` | `siren` | 929 |
| `dog_bark` | `dog_bark` | 1000 |
| `engine_idling` | `engine_idling` | 1000 |
| `constructions` | `drilling` + `jackhammer` (merged) | 2000 |

**Total: 4929 clips across the 10 official folds.**

A **coarse** 2-way sanity grouping also runs alongside the fine task:

- `mechanical` ← `engine_idling`, `constructions`
- `environmental` ← `siren`, `dog_bark`

### Where this lives in code

- `acoustic/datasets.py` — `US8K_TARGETS`, `FINE_MAP` (the drilling+jackhammer →
  `constructions` merge), `COARSE_MAP`.
- `acoustic/experiment.py` — `HARD_PAIRS` (now `engine_idling↔constructions` and
  `siren↔dog_bark`) and the conclusion prose.

---

## 3. How the classification is actually done

> ⚠️ There are **three different "classifiers"** in this project. Don't confuse them —
> only the first is the real one behind the results below.

| Classifier | Where | Accuracy | Role |
|---|---|---|---|
| **RandomForest** (this doc) | `acoustic/model.py` | **0.71–0.83 fine** | the real research/decision classifier |
| nearest-tilt "masking" | `soundwatch/.../build_mock.py` | ~0.63 (`classifierAccuracy` in the mock JSON) | crude *illustrative* demo for the dashboard — **not** the real accuracy |
| tilt + duration heuristic | backend `CLS` node in the [pipeline diagram](signal-pipeline.md) | — | conceptual/future; the RF results are the evidence it should be upgraded |

### The RandomForest pipeline (per clip)

**It never classifies raw audio — it classifies the same few numbers the sensor
publishes.** That is the whole point of the tool.

1. **Emulate → device-realistic bands** (`emulator.py`). The clip goes through the
   on-device DSP (DC removal → Hann window → FFT → bin→band grouping → per-band dB) —
   the left half of the [signal-pipeline diagram](signal-pipeline.md). Output: the band
   energies the device would publish, **not** audio.
2. **Bands → features** (`features.py`), depending on the config:
   - **Static (A, B, C):** the per-band dB vector **+ `spectral_tilt`** (low−high level;
     positive = bass-heavy like an engine) **+ `spectral_centroid`** (where the energy
     sits). → **9 features** for Config A.
   - **Temporal (A+T, B+T):** the 1 s clip is framed at 50 % overlap and each band's
     envelope-over-time is summarised by statistics that expose *modulation, not level* —
     `mean/std/var_dB`, `crest` (impulsiveness), `modrate_Hz` (strike/rev rate via
     autocorrelation), `onset_rate`, `active_frac`, plus one global `spectral_flux`.
     → **50 features** for A+T (7 bands × 7 stats + flux).
3. **RandomForest** (`model.py`): class-balanced, 300 trees, fixed seed 1234. Chosen for
   its **feature importances** — they tell the firmware team *which band / which statistic*
   to compute (see the feature-importance list at the end of §4).
4. **Evaluate by leave-one-fold-out CV** over UrbanSound8K's 10 official folds: train on 9,
   predict the held-out fold, rotate; every clip is predicted once **out-of-fold**, then
   aggregated into accuracy / macro-F1 / confusion. A random split would leak near-duplicate
   slices from the same recording and inflate the numbers.

**Why the four sources separate:** `constructions` is impulsive (high crest, strong
modulation); `engine_idling` is steady, low-flux, bass-tilted (the hardest — it overlaps
`constructions` on *level*, which is why *temporal* features lift its recall 49 %→71 %);
`siren` is tonal/bright; `dog_bark` is short bursts. Static bands reach ~0.70; the temporal
statistics are what push it to ~0.82.

## 4. Results (4-label task)

Full table: `scripts/acoustic-classifier/results/master_comparison.csv` (generated; gitignored).
Confusion matrices: `results/confusion_<config>_{fine,coarse}.png`.

| Config | n_feat | **fine acc** | fine macro-F1 | **coarse acc** | coarse macro-F1 | conf[engine↔constr] | conf[siren↔dog] |
|---|---|---|---|---|---|---|---|
| A     | 9  | 0.705 | 0.674 | 0.852 | 0.849 | 0.126 | 0.178 |
| B     | 12 | 0.735 | 0.704 | 0.844 | 0.840 | 0.082 | 0.189 |
| C     | 29 | 0.722 | 0.693 | 0.858 | 0.854 | 0.097 | 0.189 |
| **A+T** | 50 | **0.813** | **0.804** | **0.921** | **0.917** | 0.118 | 0.088 |
| **B+T** | 71 | **0.825** | **0.813** | 0.920 | 0.916 | 0.097 | 0.096 |

### Marginal accuracy of each upgrade

| Step | Upgrade | Coarse Δ | Fine Δ |
|---|---|---|---|
| A → A+T | **temporal on current hardware (no FFT change)** | **+6.9 pts** | **+10.9 pts** |
| A → B | bigger 2048-pt FFT (low-freq resolution) | −0.8 pts | +3.1 pts |
| B → C | more bands (27 third-octave vs 10 octave) | +1.4 pts | −1.3 pts |
| A → B+T | full upgrade (FFT + temporal) | +6.8 pts | +12.0 pts |

### Per-class recall (fine task) — baseline A vs best-value A+T

| Class | A recall | A+T recall |
|---|---|---|
| constructions | 81.6% | 86.2% |
| dog_bark | 77.0% | 85.2% |
| engine_idling | **49.4%** | **71.4%** |
| siren | 62.0% | 77.4% |

### Headline conclusion

- **Temporal features are the single biggest, cheapest win.** `A → A+T` adds
  **+10.9 pts fine / +6.9 pts coarse** with **no FFT change** (still ~8 KB FFT RAM) —
  the device just has to compute per-band time statistics. `A+T` is the best config
  by coarse accuracy (0.921).
- **Bigger FFT / more bands barely help** on their own (`A→B` coarse −0.8; `B→C` fine
  −1.3) — they add MQTT/Postgres data volume and RAM cost for little accuracy.
- `engine_idling` is by far the hardest class for the current bands (49% recall);
  temporal statistics lift it to 71%. Temporal also nearly halves the `siren↔dog_bark`
  confusion (0.178 → 0.088).
- **Recommendation for firmware:** invest in per-band **temporal statistics on the
  existing 512-pt hardware** before spending RAM/bandwidth on a larger FFT or more bands.

Top features `A+T` relies on (what firmware would need to compute): `band[8K]_mean_dB`,
`band[1K]_modrate_Hz`, `band[4K]_mean_dB`, `band[2K]_modrate_Hz`, `band[1K]_active_frac`,
`band[1K]_crest`, `band[1K]_onset_rate` — i.e. mostly modulation-rate / onset / crest
statistics of the 1–2 kHz bands.

> Note: the earlier machinery-only taxonomy reported a suspicious **1.000 across every
> config**. The 4-label task is a genuinely harder, more realistic problem, so these
> lower-but-meaningful numbers are the ones to trust.

---

## 5. How to reproduce these results

```bash
cd scripts/acoustic-classifier
python3 -m venv .venv && source .venv/bin/activate   # Python 3.10+
pip install -r requirements.txt

python main.py verify        # confirm the 5 target classes are present
python main.py compare       # full ablation → master_comparison.csv + confusion PNGs + conclusion
```

Features are cached under `results/cache/` keyed by (config, clip set). If you change
the label mapping or target classes, **clear the cache** first so stale labels are not
reused:

```bash
rm -f results/cache/*.npz
```

Other subcommands: `python main.py selftest` (DSP faithfulness tests, no data),
`python main.py train --config A+T` (one config + confusion matrix + importances).

---

## 6. Relationship to the SoundWatch platform

The **same DSP** (`minimal_bands.py`) is shared with `soundwatch/scripts/soundbands/`,
which turns UrbanSound8K into the sensor's 7 bands and builds the dashboard mock JSON
using the **same 4-label taxonomy**. See
[reproduce-mock-data.md](reproduce-mock-data.md).

The classifier here answers *"what should the firmware compute?"*; the soundbands
pipeline answers *"what does the dashboard show until real sensor history exists?"*.

# SCK Acoustic Sensor — Classification Research & Config Ablation

An offline research + evaluation tool for our Smart Citizen Kit (SCK) noise
sensor. It **emulates** the on-device DSP pipeline for several hardware
configurations, trains a sound-source classifier on the *device-realistic* band
energies (not the original hi-fi audio), and quantifies **how much accuracy each
proposed firmware/schema upgrade actually buys** — so we can decide what to
commit to before touching firmware or the Postgres schema.

This is a prototype of the classifier that will eventually run in the backend
`CLS` node, and a decision tool. It is **not** firmware.

## The question it answers

With only the 7 band energies the device publishes today, **what source
categories can we reliably classify — and what is the marginal accuracy of each
of three upgrades?**

| Upgrade | Config | What it isolates |
|---|---|---|
| — (baseline) | **A** | 512-pt FFT, 7 fixed firmware bands, static — what we ship today |
| Bigger FFT | **B** | 2048-pt FFT (21.5 Hz/bin) → real 31.5/63/125 Hz octaves |
| More bands | **C** | 2048-pt, ~27 third-octave bands |
| Temporal features | **A+T** | per-band time statistics on the *current* 512-pt hardware (no FFT change) |
| Full upgrade | **B+T** | 2048-pt FFT + temporal |

The factorial design attributes gains: `A→A+T` = temporal alone (cheapest
firmware change), `A→B` = FFT/low-freq resolution, `B→C` = band count,
`A→B+T` = the full upgrade.

## The emulator (the heart of the tool)

`acoustic/emulator.py` reprocesses any full-quality clip into exactly what the
device would publish for a given `SensorConfig`, faithfully following the DSP
diagram: DC removal → Hann window → real FFT → **bin→band mapping computed from
`sample_rate`/`nfft`/band-edge frequencies** → per-band RMS → dB. The band
branch is deliberately **not** A-weighted (preserving low-frequency energy for
truck/engine discrimination).

Faithfulness is proven by a test: Config A's *computed* bin→band mapping must
equal the fixed firmware table `LOW=1-2, 250=3-4, 500=5-8, 1K=9-16, 2K=17-33,
4K=34-66, 8K=67-131`. Run `python main.py selftest`.

## Install

```bash
python3 -m venv .venv && source .venv/bin/activate   # Python 3.10+
pip install -r requirements.txt
```

## Get the data

**UrbanSound8K** (primary — the exact classes we care about: `drilling`,
`jackhammer`, `engine_idling`, `air_conditioner`, plus foils; 10 official folds).
It sits behind a free request form, so it can't be auto-downloaded:

```bash
python main.py download          # prints exact placement instructions
```

Extract so the layout is:

```
data/UrbanSound8K/
  metadata/UrbanSound8K.csv
  audio/fold1/ ... audio/fold10/
```

Override the root with `--data /path/to/data` (or `ACOUSTIC_DATA=...`).

**ESC-50** (optional secondary foils — `engine`, `chainsaw`, `hand_saw`) is
freely cloneable:

```bash
python main.py download --esc50   # clones ESC-50 next to the data root
```

Check what's actually present:

```bash
python main.py verify
```

## Run the ablation

```bash
python main.py compare                 # the deliverable: master table + conclusion
python main.py compare --with-other    # add non-machinery foils → 3-way coarse task
python main.py compare --esc50         # fold in ESC-50 machinery foils
```

`compare` emulates every config, extracts + **caches** features
(`results/cache/`), runs **10-fold cross-validation over the official folds**
(never a random split), and writes:

- `results/master_comparison.csv` — the decision table (rows = configs; accuracy,
  macro-F1, drilling↔jackhammer & engine_idling↔jackhammer confusion, feature
  count, RAM/data-cost note).
- `results/confusion_<config>_{fine,coarse}.png` — confusion matrices.
- a plain-language **conclusion block** on stdout, filled with the real measured
  deltas, plus the feature importances of the best config (which bands / which
  temporal stats the firmware would actually need to compute).

Experiments run for **both** the fine classes (drilling vs jackhammer vs
engine_idling vs air_conditioner) and the coarse classes (`impulsive_tool` /
`steady_engine` / `other`).

### Other subcommands

```bash
python main.py selftest                 # emulator faithfulness tests (no data)
python main.py demo                     # push synthetic signals through every config (no data)
python main.py extract [--config A]     # emulate + cache features only
python main.py train --config A+T       # cross-validate one config, print importances
python main.py --model logreg train --config B   # logistic-regression baseline
```

## Interpreting the result

The master table + conclusion tell you (a) what the current 7 bands can classify
and (b) the marginal accuracy of each upgrade, with cost context:

- **Config B (2048-pt FFT)** ≈ 16 KB FFT RAM — borderline on a 32 KB SAMD21.
- **Config C (third-octave)** multiplies published data volume (~27 numbers ×
  ~50 sensors × readings/s) and adds Postgres columns / metric-ids backend-side.
- **A+T (temporal on current hardware)** needs no FFT change — the cheapest
  firmware change — but the device must compute per-band time statistics.
- Longer FFTs use a larger hop, which **lowers** the temporal modulation ceiling
  (`max_modulation_hz`): 512-pt A+T sees ~86 Hz modulation; 2048-pt B+T only
  ~22 Hz. This is reported per config and matters for fast jackhammer strikes.

Weigh the measured accuracy gain against these costs to decide whether to change
firmware and schema.

## Layout

```
main.py                 CLI (download / verify / selftest / demo / extract / train / compare)
acoustic/
  config.py             SensorConfig dataclass + the 5-config registry
  emulator.py           pure DSP: framing, FFT, bin→band mapping, dB
  features.py           static descriptors + temporal/modulation statistics
  datasets.py           UrbanSound8K / ESC-50 discovery, verification, audio loading
  model.py              feature caching, 10-fold CV, metrics, importances
  experiment.py         ablation runner, master table, confusion plots, conclusion
  download.py           dataset instructions / ESC-50 fetch
tests/test_emulator.py  Config-A bin-mapping faithfulness + DSP sanity tests
results/                CSVs, confusion PNGs, cached features
```

## Notes

- Fixed seed (`SEED = 1234`); deterministic where the libraries allow.
- Clips shorter than 1 s are **zero-padded**, never silently dropped.
- Features are cached per (config, clip-set); delete `results/cache/` to force
  re-extraction, or pass `--no-cache`.

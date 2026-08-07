"""Dataset discovery, verification, and device-realistic audio loading.

Primary dataset is **UrbanSound8K** (10 official folds -- always used for
cross-validation, never a random split).  **ESC-50** is an optional secondary
source of machinery foils.  We never hardcode which classes exist: the loaders
read each dataset's metadata and report the intersection with our targets.

Fine label taxonomy (the deliverable — 4 sound sources the platform reports):

    siren
    dog_bark
    engine_idling
    constructions  <- drilling + jackhammer merged (both are impulsive power tools)

Coarse label mapping (a broader mechanical-vs-environmental sanity grouping):

    mechanical    <- engine_idling, constructions (, drilling, jackhammer)
    environmental <- siren, dog_bark

Experiments run on both the fine classes and the coarse classes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

DATA_ROOT = os.environ.get("ACOUSTIC_DATA", "data")

# Raw UrbanSound8K classes we load for the 4-label task.  drilling + jackhammer
# are both pulled in but collapse to a single fine label (see FINE_MAP).
US8K_TARGETS = ["siren", "dog_bark", "engine_idling", "jackhammer", "drilling"]
ESC50_TARGETS = ["engine", "chainsaw", "hand_saw", "jackhammer", "drilling"]

# Non-target UrbanSound8K classes available (opt-in via --with-other) as foils
# for the coarse task.  siren / dog_bark are NOT here anymore -- they are targets.
US8K_OTHER = ["street_music", "children_playing", "car_horn", "air_conditioner"]

# Raw dataset class -> merged FINE label.  Only drilling + jackhammer merge; every
# other target keeps its own name.  Keyed on the dataset's own class strings.
FINE_MAP: Dict[str, str] = {
    "drilling": "constructions",
    "jackhammer": "constructions",
}

# Raw dataset class -> COARSE label (mechanical vs environmental).  Keyed on the
# raw class so it is independent of the fine merge above.
COARSE_MAP: Dict[str, str] = {
    "drilling": "mechanical",
    "jackhammer": "mechanical",
    "engine_idling": "mechanical",
    "siren": "environmental",
    "dog_bark": "environmental",
}


def fine_label(raw: str) -> str:
    """Dataset class string -> the merged fine label used for classification."""
    return FINE_MAP.get(raw, raw)


def coarse_label(raw: str) -> str:
    return COARSE_MAP.get(raw, "other")


@dataclass
class Clip:
    """One labelled audio clip and its metadata."""
    path: str
    fold: int          # official fold (UrbanSound8K 1..10); synthetic for ESC-50
    fine_label: str
    coarse_label: str
    dataset: str


# ---------------------------------------------------------------------------
# Audio loading -> device-realistic mono at the config sample rate
# ---------------------------------------------------------------------------
def load_audio(path: str, sample_rate: int, min_seconds: float = 1.0) -> np.ndarray:
    """Load ``path`` as mono float, resampled to ``sample_rate``.

    Short clips are zero-padded up to ``min_seconds`` (never dropped) so temporal
    configs always have a full 1 s of frames to analyse.  Uses ``soundfile`` when
    it can, else falls back to ``librosa`` (handles the odd formats in
    UrbanSound8K that libsndfile rejects).
    """
    y: Optional[np.ndarray] = None
    sr: Optional[int] = None
    try:
        import soundfile as sf
        y, sr = sf.read(path, always_2d=False)
    except Exception:
        y = None
    if y is None:
        import librosa
        y, sr = librosa.load(path, sr=None, mono=False)

    y = np.asarray(y, dtype=np.float64)
    if y.ndim > 1:  # mixdown to mono
        y = y.mean(axis=1) if y.shape[1] <= y.shape[0] else y.mean(axis=0)

    if sr != sample_rate:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(int(sr), int(sample_rate))
        y = resample_poly(y, sample_rate // g, sr // g)

    min_len = int(min_seconds * sample_rate)
    if len(y) < min_len:
        y = np.pad(y, (0, min_len - len(y)))
    return y


# ---------------------------------------------------------------------------
# UrbanSound8K
# ---------------------------------------------------------------------------
def us8k_paths(root: str = DATA_ROOT) -> Dict[str, str]:
    base = os.path.join(root, "UrbanSound8K")
    return {
        "base": base,
        "meta": os.path.join(base, "metadata", "UrbanSound8K.csv"),
        "audio": os.path.join(base, "audio"),
    }


US8K_INSTRUCTIONS = """\
UrbanSound8K not found.  It requires a (free) download form, so it cannot be
fetched automatically.  Steps:

  1. Request + download from https://urbansounddataset.weebly.com/urbansound8k.html
  2. Extract so the layout is exactly:

       {base}/
         metadata/UrbanSound8K.csv
         audio/fold1/  ... audio/fold10/

  3. Re-run.  (Override the data root with ACOUSTIC_DATA=/path/to/data.)
"""


def load_us8k(root: str = DATA_ROOT, targets: Optional[List[str]] = None,
              include_other: bool = False) -> List[Clip]:
    """Return target-class clips from UrbanSound8K, or [] with instructions.

    When ``include_other`` is set, a sample of non-machinery classes
    (:data:`US8K_OTHER`) is added; they all map to the coarse ``other`` label.
    """
    p = us8k_paths(root)
    if not os.path.exists(p["meta"]):
        print(US8K_INSTRUCTIONS.format(base=p["base"]))
        return []
    df = pd.read_csv(p["meta"])
    available = sorted(df["class"].unique().tolist())
    targets = list(targets or US8K_TARGETS)
    if include_other:
        targets = targets + [c for c in US8K_OTHER if c in available]
    present = [t for t in targets if t in available]
    missing = [t for t in targets if t not in available]
    print(f"[UrbanSound8K] {len(df)} clips, {len(available)} classes.")
    print(f"[UrbanSound8K] target classes present: {present}")
    if missing:
        print(f"[UrbanSound8K] WARNING target classes NOT found: {missing}")

    clips: List[Clip] = []
    sub = df[df["class"].isin(present)]
    for _, row in sub.iterrows():
        fold = int(row["fold"])
        path = os.path.join(p["audio"], f"fold{fold}", str(row["slice_file_name"]))
        cls = str(row["class"])
        clips.append(Clip(
            path=path, fold=fold, fine_label=fine_label(cls),
            coarse_label=coarse_label(cls), dataset="UrbanSound8K",
        ))
    print(f"[UrbanSound8K] loaded {len(clips)} target clips across "
          f"{sub['fold'].nunique()} folds.")
    return clips


# ---------------------------------------------------------------------------
# ESC-50 (optional secondary)
# ---------------------------------------------------------------------------
def esc50_paths(root: str = DATA_ROOT) -> Dict[str, str]:
    base = os.path.join(root, "ESC-50-master")
    return {
        "base": base,
        "meta": os.path.join(base, "meta", "esc50.csv"),
        "audio": os.path.join(base, "audio"),
    }


ESC50_INSTRUCTIONS = """\
ESC-50 (optional) not found.  It is freely downloadable:

    git clone https://github.com/karolpiczak/ESC-50.git {base}
      (or download the zip and extract to {base})

Expected layout: {base}/meta/esc50.csv and {base}/audio/*.wav
"""


def load_esc50(root: str = DATA_ROOT, targets: Optional[List[str]] = None) -> List[Clip]:
    """Return machinery-foil clips from ESC-50, or [] with instructions."""
    p = esc50_paths(root)
    if not os.path.exists(p["meta"]):
        print(ESC50_INSTRUCTIONS.format(base=p["base"]))
        return []
    df = pd.read_csv(p["meta"])
    available = sorted(df["category"].unique().tolist())
    targets = targets or ESC50_TARGETS
    present = [t for t in targets if t in available]
    print(f"[ESC-50] {len(df)} clips; target classes present: {present}")

    clips: List[Clip] = []
    sub = df[df["category"].isin(present)]
    for _, row in sub.iterrows():
        # ESC-50 has its own 5 folds; offset by 100 so they never collide with
        # UrbanSound8K's 1..10 if the two datasets are ever mixed.
        fold = 100 + int(row["fold"])
        path = os.path.join(p["audio"], str(row["filename"]))
        cat = str(row["category"])
        clips.append(Clip(
            path=path, fold=fold, fine_label=fine_label(cat),
            coarse_label=coarse_label(cat), dataset="ESC-50",
        ))
    print(f"[ESC-50] loaded {len(clips)} target clips.")
    return clips


def verify(root: str = DATA_ROOT) -> None:
    """Print which target classes actually exist in each dataset (no loading)."""
    print("=== Dataset verification ===")
    p = us8k_paths(root)
    if os.path.exists(p["meta"]):
        df = pd.read_csv(p["meta"])
        avail = sorted(df["class"].unique())
        print(f"UrbanSound8K: found. Classes = {avail}")
        print(f"  targets present: {[t for t in US8K_TARGETS if t in avail]}")
        counts = df[df['class'].isin(US8K_TARGETS)].groupby('class').size().to_dict()
        print(f"  target clip counts: {counts}")
    else:
        print(f"UrbanSound8K: MISSING ({p['meta']})")
    q = esc50_paths(root)
    if os.path.exists(q["meta"]):
        df = pd.read_csv(q["meta"])
        avail = sorted(df["category"].unique())
        print(f"ESC-50: found. machinery targets present: "
              f"{[t for t in ESC50_TARGETS if t in avail]}")
    else:
        print(f"ESC-50: MISSING ({q['meta']}) [optional]")

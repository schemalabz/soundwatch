"""Feature caching, cross-validation, and metrics.

Evaluation protocol (non-negotiable): **UrbanSound8K's 10 official folds**.  Each
fold is held out once as the test set while the classifier trains on the other
nine; every clip is therefore predicted exactly once, out-of-fold.  We aggregate
those out-of-fold predictions and report accuracy + macro-F1 (classes are
imbalanced) and a full confusion matrix.  A random split would leak near-
duplicate slices between train and test and inflate the numbers, so we never
use one.

The primary model is a RandomForest -- interpretable, gives feature importances,
and mirrors a lightweight backend classifier.  A logistic-regression baseline is
available for comparison.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .config import SensorConfig
from .datasets import Clip, load_audio
from .features import extract_features, feature_names

SEED = 1234
CACHE_DIR = os.path.join("results", "cache")


# ---------------------------------------------------------------------------
# Feature extraction with on-disk caching
# ---------------------------------------------------------------------------
@dataclass
class FeatureSet:
    X: np.ndarray               # (n_clips, n_features)
    folds: np.ndarray           # (n_clips,) official fold ids
    fine: np.ndarray            # (n_clips,) fine class strings
    coarse: np.ndarray          # (n_clips,) coarse class strings
    feature_names: List[str]
    config_name: str


def _cache_key(cfg: SensorConfig, clips: List[Clip]) -> str:
    """Cache is keyed by config + the exact clip set (paths), so stale caches
    never silently mismatch."""
    h = hashlib.sha1()
    h.update(cfg.name.encode())
    h.update(str(cfg.nfft).encode())
    h.update(str(cfg.hop).encode())
    for c in sorted(clips, key=lambda c: c.path):
        h.update(c.path.encode())
    return h.hexdigest()[:12]


def extract_dataset(cfg: SensorConfig, clips: List[Clip],
                    use_cache: bool = True, progress: bool = True) -> FeatureSet:
    """Emulate + featurise every clip under ``cfg``; cache the matrix to disk."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = _cache_key(cfg, clips)
    cache_path = os.path.join(CACHE_DIR, f"feat_{cfg.name.replace('+', '')}_{key}.npz")

    if use_cache and os.path.exists(cache_path):
        d = np.load(cache_path, allow_pickle=True)
        print(f"[extract] {cfg.name}: loaded cached features {d['X'].shape} "
              f"from {cache_path}")
        return FeatureSet(d["X"], d["folds"], d["fine"], d["coarse"],
                          list(d["feature_names"]), cfg.name)

    names = feature_names(cfg)
    X = np.empty((len(clips), len(names)), dtype=np.float64)
    folds = np.empty(len(clips), dtype=np.int64)
    fine = np.empty(len(clips), dtype=object)
    coarse = np.empty(len(clips), dtype=object)

    for i, clip in enumerate(clips):
        y = load_audio(clip.path, cfg.sample_rate)
        vec, _ = extract_features(y, cfg)
        X[i] = vec
        folds[i] = clip.fold
        fine[i] = clip.fine_label
        coarse[i] = clip.coarse_label
        if progress and (i % 200 == 0 or i == len(clips) - 1):
            print(f"[extract] {cfg.name}: {i + 1}/{len(clips)} clips", flush=True)

    # Guard against non-finite features (silent bands, degenerate envelopes).
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    np.savez_compressed(cache_path, X=X, folds=folds, fine=fine, coarse=coarse,
                        feature_names=np.array(names, dtype=object))
    print(f"[extract] {cfg.name}: cached features {X.shape} -> {cache_path}")
    return FeatureSet(X, folds, fine, coarse, names, cfg.name)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
def make_model(kind: str = "rf"):
    if kind == "rf":
        return RandomForestClassifier(
            n_estimators=300, max_depth=None, n_jobs=-1,
            class_weight="balanced", random_state=SEED,
        )
    if kind == "logreg":
        return make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=2000, class_weight="balanced",
                               random_state=SEED),
        )
    raise ValueError(f"unknown model kind {kind!r}")


# ---------------------------------------------------------------------------
# Fold cross-validation
# ---------------------------------------------------------------------------
@dataclass
class CVResult:
    y_true: np.ndarray
    y_pred: np.ndarray
    labels: List[str]
    accuracy: float
    macro_f1: float
    confusion: np.ndarray
    importances: Optional[np.ndarray]   # mean over folds (RF only)
    feature_names: List[str]


def cross_validate(fs: FeatureSet, label_kind: str = "fine",
                   model_kind: str = "rf") -> CVResult:
    """Leave-one-fold-out CV over the official folds; aggregate OOF predictions."""
    y = fs.fine if label_kind == "fine" else fs.coarse
    labels = sorted(np.unique(y).tolist())
    unique_folds = sorted(np.unique(fs.folds).tolist())

    y_true_all: List[str] = []
    y_pred_all: List[str] = []
    importances_acc = np.zeros(fs.X.shape[1])
    imp_count = 0

    for test_fold in unique_folds:
        te = fs.folds == test_fold
        tr = ~te
        if len(np.unique(y[tr])) < 2:
            continue  # a fold split that leaves one class untrainable -> skip
        model = make_model(model_kind)
        model.fit(fs.X[tr], y[tr])
        pred = model.predict(fs.X[te])
        y_true_all.extend(y[te].tolist())
        y_pred_all.extend(pred.tolist())
        if model_kind == "rf" and hasattr(model, "feature_importances_"):
            importances_acc += model.feature_importances_
            imp_count += 1

    y_true = np.array(y_true_all)
    y_pred = np.array(y_pred_all)
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    importances = importances_acc / imp_count if imp_count else None

    return CVResult(
        y_true=y_true, y_pred=y_pred, labels=labels,
        accuracy=float(accuracy_score(y_true, y_pred)),
        macro_f1=float(f1_score(y_true, y_pred, labels=labels, average="macro")),
        confusion=cm, importances=importances, feature_names=fs.feature_names,
    )


# ---------------------------------------------------------------------------
# Confusion analysis
# ---------------------------------------------------------------------------
def pair_confusion_rate(cm: np.ndarray, labels: List[str], a: str, b: str) -> Optional[float]:
    """Symmetric confusion rate for a known-hard pair (a<->b).

    Of all clips whose *true* class is a or b, the fraction predicted as the
    other member of the pair.  Returns None if either class is absent (e.g. the
    coarse scheme, where drilling/jackhammer are merged).
    """
    if a not in labels or b not in labels:
        return None
    ia, ib = labels.index(a), labels.index(b)
    cross = cm[ia, ib] + cm[ib, ia]
    total = cm[ia].sum() + cm[ib].sum()
    return float(cross / total) if total else 0.0


def top_importances(cv: CVResult, k: int = 12) -> List[Tuple[str, float]]:
    if cv.importances is None:
        return []
    order = np.argsort(cv.importances)[::-1][:k]
    return [(cv.feature_names[i], float(cv.importances[i])) for i in order]

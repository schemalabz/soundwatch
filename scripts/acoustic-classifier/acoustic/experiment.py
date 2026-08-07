"""The ablation: run every config, emit the master comparison table + conclusion.

This is the deliverable that answers the decision question:
  (a) what the current 7 bands can classify, and
  (b) the marginal accuracy from each of the three proposed upgrades.

Attribution follows the factorial design:
    A  -> A+T   temporal features alone (cheapest firmware change, no FFT change)
    A  -> B     bigger FFT / low-frequency resolution
    B  -> C     more bands (third-octave)
    A  -> B+T   the full upgrade (FFT + temporal)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional

import matplotlib
matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from .config import CONFIGS, SensorConfig
from .datasets import Clip, load_esc50, load_us8k
from .model import (
    CVResult,
    cross_validate,
    extract_dataset,
    pair_confusion_rate,
    top_importances,
)

RESULTS_DIR = "results"
CONFIG_ORDER = ["A", "B", "C", "A+T", "B+T"]

# Known-hard pairs to track across upgrades: the two mechanical sources that can
# be confused (steady engine vs impulsive tools) and the two environmental sounds.
HARD_PAIRS = [("engine_idling", "constructions"), ("siren", "dog_bark")]


@dataclass
class ConfigOutcome:
    name: str
    cfg: SensorConfig
    fine: CVResult
    coarse: CVResult


def _plot_confusion(cv: CVResult, title: str, path: str) -> None:
    cm = cv.confusion.astype(float)
    row_sums = cm.sum(axis=1, keepdims=True)
    norm = np.divide(cm, row_sums, out=np.zeros_like(cm), where=row_sums > 0)
    fig, ax = plt.subplots(figsize=(1.4 + 0.7 * len(cv.labels), 1.4 + 0.7 * len(cv.labels)))
    im = ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(cv.labels)))
    ax.set_yticks(range(len(cv.labels)))
    ax.set_xticklabels(cv.labels, rotation=45, ha="right", fontsize=8)
    ax.set_yticklabels(cv.labels, fontsize=8)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title, fontsize=10)
    for i in range(len(cv.labels)):
        for j in range(len(cv.labels)):
            ax.text(j, i, f"{norm[i, j]:.2f}", ha="center", va="center",
                    fontsize=7, color="white" if norm[i, j] > 0.5 else "black")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def load_clips(with_esc50: bool = False, with_other: bool = False,
               root: Optional[str] = None) -> List[Clip]:
    kw = {"root": root} if root else {}
    clips = load_us8k(include_other=with_other, **kw)
    if with_esc50:
        clips = clips + load_esc50(**kw)
    return clips


def run_ablation(clips: List[Clip], model_kind: str = "rf",
                 use_cache: bool = True) -> List[ConfigOutcome]:
    outcomes: List[ConfigOutcome] = []
    for name in CONFIG_ORDER:
        cfg = CONFIGS[name]
        print(f"\n=== Config {name} ({cfg.nfft}-pt, {cfg.n_bands} bands, "
              f"{'temporal' if cfg.temporal else 'static'}) ===")
        fs = extract_dataset(cfg, clips, use_cache=use_cache)
        fine = cross_validate(fs, label_kind="fine", model_kind=model_kind)
        coarse = cross_validate(fs, label_kind="coarse", model_kind=model_kind)
        print(f"  fine:   acc={fine.accuracy:.3f}  macroF1={fine.macro_f1:.3f}")
        print(f"  coarse: acc={coarse.accuracy:.3f}  macroF1={coarse.macro_f1:.3f}")
        outcomes.append(ConfigOutcome(name, cfg, fine, coarse))
    return outcomes


def build_master_table(outcomes: List[ConfigOutcome]) -> pd.DataFrame:
    rows = []
    for o in outcomes:
        row = {
            "config": o.name,
            "nfft": o.cfg.nfft,
            "bin_Hz": round(o.cfg.bin_hz, 1),
            "n_bands": o.cfg.n_bands,
            "temporal": o.cfg.temporal,
            "n_features": len(o.fine.feature_names),
            "fine_acc": round(o.fine.accuracy, 3),
            "fine_macroF1": round(o.fine.macro_f1, 3),
            "coarse_acc": round(o.coarse.accuracy, 3),
            "coarse_macroF1": round(o.coarse.macro_f1, 3),
        }
        for a, b in HARD_PAIRS:
            rate = pair_confusion_rate(o.fine.confusion, o.fine.labels, a, b)
            row[f"conf[{a}<->{b}]"] = round(rate, 3) if rate is not None else np.nan
        row["cost_note"] = o.cfg.ram_note
        rows.append(row)
    return pd.DataFrame(rows).set_index("config").reindex(CONFIG_ORDER)


def _delta(outcomes: Dict[str, ConfigOutcome], frm: str, to: str, field: str) -> Optional[float]:
    if frm not in outcomes or to not in outcomes:
        return None
    a = getattr(outcomes[frm], "coarse" if field.startswith("coarse") else "fine")
    b = getattr(outcomes[to], "coarse" if field.startswith("coarse") else "fine")
    attr = "accuracy" if field.endswith("acc") else "macro_f1"
    return getattr(b, attr) - getattr(a, attr)


def _pct(x: Optional[float]) -> str:
    if x is None:
        return "n/a"
    return f"{x * 100:+.1f} pts"


def conclusion_block(outcomes: List[ConfigOutcome]) -> str:
    """Plain-language decision summary, filled with the real measured numbers."""
    o = {x.name: x for x in outcomes}
    L: List[str] = []
    L.append("=" * 72)
    L.append("CONCLUSION -- what the 7 bands classify, and what each upgrade buys")
    L.append("=" * 72)

    if "A" in o:
        a = o["A"]
        L.append(
            f"(a) Baseline Config A (7 fixed bands, 512-pt, static) reaches "
            f"coarse acc={a.coarse.accuracy:.3f} / macro-F1={a.coarse.macro_f1:.3f} "
            f"and fine acc={a.fine.accuracy:.3f} / macro-F1={a.fine.macro_f1:.3f}."
        )
        L.append(
            "    -> The current bands can separate the coarse "
            "mechanical vs environmental categories at the coarse "
            "accuracy above; the fine 4-way split (siren / dog_bark / "
            "engine_idling / constructions) is where it struggles."
        )

    L.append("(b) Marginal accuracy of each upgrade (coarse acc / fine acc):")
    steps = [
        ("A", "A+T", "temporal features on CURRENT hardware (no FFT change)"),
        ("A", "B",   "bigger 2048-pt FFT (real 31.5/63/125 Hz low-freq resolution)"),
        ("B", "C",   "more bands (27 third-octave vs 10 octave)"),
        ("A", "B+T", "full upgrade (2048-pt FFT + temporal)"),
    ]
    for frm, to, desc in steps:
        dc = _delta(o, frm, to, "coarse_acc")
        df = _delta(o, frm, to, "fine_acc")
        L.append(f"    {frm:>3} -> {to:<3}  {desc}")
        L.append(f"           coarse {_pct(dc)} | fine {_pct(df)}")

    # Hard-pair movement on the fine task, A vs best.
    if "A" in o:
        for pa, pb in HARD_PAIRS:
            base = pair_confusion_rate(o["A"].fine.confusion, o["A"].fine.labels, pa, pb)
            if base is None:
                continue
            best_name = max(o, key=lambda n: o[n].fine.accuracy)
            best = pair_confusion_rate(o[best_name].fine.confusion,
                                       o[best_name].fine.labels, pa, pb)
            L.append(
                f"    {pa}<->{pb} confusion: A={base:.3f} -> "
                f"{best_name}={best:.3f}"
            )

    # Best config + what its features rely on.
    best = max(outcomes, key=lambda x: x.coarse.accuracy)
    L.append(f"Best config by coarse accuracy: {best.name} "
             f"(acc={best.coarse.accuracy:.3f}, macro-F1={best.coarse.macro_f1:.3f}).")
    imps = top_importances(best.fine, k=8)
    if imps:
        L.append("Top features the firmware would actually need to compute "
                 f"(config {best.name}):")
        for name, val in imps:
            L.append(f"    {val:.3f}  {name}")
    L.append("Cost context: " + best.cfg.ram_note)
    L.append("=" * 72)
    return "\n".join(L)


def run_and_report(clips: List[Clip], model_kind: str = "rf",
                   use_cache: bool = True) -> pd.DataFrame:
    """Full pipeline: ablate, save CSV + confusion PNGs, print master table + conclusion."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    outcomes = run_ablation(clips, model_kind=model_kind, use_cache=use_cache)

    table = build_master_table(outcomes)
    csv_path = os.path.join(RESULTS_DIR, "master_comparison.csv")
    table.to_csv(csv_path)

    for o in outcomes:
        safe = o.name.replace("+", "")
        _plot_confusion(o.fine, f"{o.name} -- fine (4-way)",
                        os.path.join(RESULTS_DIR, f"confusion_{safe}_fine.png"))
        _plot_confusion(o.coarse, f"{o.name} -- coarse",
                        os.path.join(RESULTS_DIR, f"confusion_{safe}_coarse.png"))

    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 30)
    print("\n" + "=" * 72)
    print("MASTER COMPARISON TABLE  (rows = configs)")
    print("=" * 72)
    # Drop the long cost note from the console view; it stays in the CSV.
    print(table.drop(columns=["cost_note"]).to_string())
    print(f"\nSaved: {csv_path}")
    print(f"Saved confusion matrices -> {RESULTS_DIR}/confusion_*.png")
    print("\n" + conclusion_block(outcomes))
    return table

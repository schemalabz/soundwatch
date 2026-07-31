"""
Turn reduced band vectors (bands.csv) into a UI mock JSON for the redesign,
and demonstrate the masking classifier on the real dataset.

What is REAL (dataset-derived):
  - per-source band MASKS (mean tilt vector across the 7 bands)
  - per-source LOUDNESS (relative energy)
  - the masking classifier + its accuracy

What is SYNTHETIC (a plausible prior, NOT from the dataset):
  - the diurnal / seasonal TIMING of the dashboard curves. UrbanSound8K is
    isolated clips with no time-of-day structure. Replace this with real sensor
    history once the mosquitto -> ingester -> Postgres pipeline is live.

Usage:
  python build_mock.py --bands bands.csv --out ../../src/lib/soundwatchMock.json
"""
import argparse
import json

import numpy as np
import pandas as pd

# 7 band columns (must match reduce_urbansound.BAND_COLS / minimal_bands.LABELS order).
BAND_NAMES = ["noise_low", "noise_250", "noise_500", "noise_1k", "noise_2k", "noise_4k", "noise_8k"]

# UrbanSound8K class -> one of the redesign's 4 UI sources.  These mirror the
# the acoustic-classifier's 4-label taxonomy exactly: drilling + jackhammer
# merge into `constructions`; every other US8K class is dropped (not one of the 4).
CLASS_TO_SOURCE = {
    "engine_idling": "engine_idling",
    "dog_bark": "dog_bark",
    "jackhammer": "constructions", "drilling": "constructions",
    "siren": "siren",
}
SOURCES = ["engine_idling", "dog_bark", "constructions", "siren"]

# --- synthetic timing priors (0..1 weight per hour of day) ------------------
def _circ_gauss(h, c, w):
    return max(np.exp(-(((h - c + o) ** 2) / (2 * w * w))) for o in (-24, 0, 24))

DIURNAL = {
    "engine_idling": lambda h: 0.25 + _circ_gauss(h, 8, 2.5) + _circ_gauss(h, 18, 2.5),
    "dog_bark":      lambda h: 0.15 + 0.6 * _circ_gauss(h, 8, 3.0) + _circ_gauss(h, 19, 3.5),
    "constructions": lambda h: 0.02 + (_circ_gauss(h, 11, 3.0) if 7 <= h <= 17 else 0),
    "siren":         lambda h: 0.30 + 0.3 * _circ_gauss(h, 22, 4),
}
# month-of-year seasonal center/width/peak (synthetic)
SEASON = {
    "engine_idling": (5, 6, 0.8), "dog_bark": (6.5, 2.4, 1.0),
    "constructions": (4, 2.8, 0.9), "siren": (1.5, 3.5, 0.6),
}
PERIOD_HOURS = {"day": range(7, 19), "evening": range(19, 23),
                "night": list(range(23, 24)) + list(range(0, 7))}


def _gauss(x, c, w):
    return float(np.exp(-((x - c) ** 2) / (2 * w * w)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bands", default="bands.csv")
    ap.add_argument("--out", default="soundwatchMock.json")
    args = ap.parse_args()
    rng = np.random.default_rng(42)

    df = pd.read_csv(args.bands)
    df["source"] = df["class"].map(CLASS_TO_SOURCE)
    df = df.dropna(subset=["source"])
    X = df[BAND_NAMES].to_numpy()
    tilt = X - X.mean(axis=1, keepdims=True)  # offset-safe shape (matches the heatmap)

    # --- per-source masks (mean tilt) + loudness (relative energy) ----------
    masks, loud = {}, {}
    for s in SOURCES:
        m = df["source"] == s
        if not m.any():
            continue
        masks[s] = dict(zip(BAND_NAMES, tilt[m.to_numpy()].mean(axis=0).round(2)))
        power = np.power(10.0, X[m.to_numpy()] / 10.0).sum(axis=1)   # linear energy
        loud[s] = float(power.mean())
    lo, hi = min(loud.values()), max(loud.values())
    loud = {s: round((v - lo) / (hi - lo + 1e-9), 3) for s, v in loud.items()}  # 0..1

    # Only sources actually present in the data (robust to partial/--limit runs).
    used = [s for s in SOURCES if s in masks]
    if len(used) < len(SOURCES):
        print("warning: no data for", [s for s in SOURCES if s not in used],
              "- run without --limit for the full set")

    # --- masking classifier: nearest source-mask on tilt, report accuracy ---
    mask_mat = np.array([[masks[s][b] for b in BAND_NAMES] for s in used])
    pred = np.array([used[np.argmin(np.linalg.norm(mask_mat - t, axis=1))] for t in tilt])
    acc = float((pred == df["source"].to_numpy()).mean())

    # --- dashboard curves: dataset loudness x synthetic timing --------------
    pweight = {s: {p: np.mean([DIURNAL[s](h) for h in hrs]) for p, hrs in PERIOD_HOURS.items()}
               for s in used}
    base = {s: {p: min(1.0, loud[s] * pweight[s][p] * 1.6 + 0.05) for p in PERIOD_HOURS}
            for s in used}

    forecast = {p: [{"key": s, "days": [round(float(min(1, max(0.05, base[s][p] + (rng.random() - 0.5) * 0.3))), 3)
                                        for _ in range(7)]} for s in used]
                for p in PERIOD_HOURS}
    calendar = [{"key": s, "monthly": [round(_gauss(m, *SEASON[s][:2]) * SEASON[s][2] * (0.4 + loud[s]), 3)
                                       for m in range(12)]} for s in used]
    seasons = [c for c in calendar if c["key"] in ("engine_idling", "dog_bark", "constructions")]
    hourly = [round(float(min(1, sum(DIURNAL[s](h) * loud[s] for s in used) / max(1, len(used)) + 0.08)), 3)
              for h in range(24)]
    year = [round(float(min(1, np.mean([calendar_i["monthly"][m] for calendar_i in calendar]) * 2.2 + 0.15)), 3)
            for m in range(12)]

    out = {
        "_note": "bands+classification are UrbanSound8K-derived (real); diurnal/seasonal timing is a synthetic prior.",
        "classifierAccuracy": round(acc, 3),
        "masks": masks, "sourceLoudness": loud,
        "forecast": forecast, "calendar": calendar, "seasons": seasons,
        "hourly": hourly, "year": year,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    print(f"masking classifier source-accuracy: {acc:.1%}")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

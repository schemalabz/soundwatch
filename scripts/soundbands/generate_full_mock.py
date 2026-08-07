"""
Full per-second sensor mock for the UI: a reading every second for N sensors,
with ALL sensor fields.

  - Noise fields (dBA + 7 bands): REAL, taken second-by-second from bands.csv
    (UrbanSound8K processed serially by minimal_bands). Each sensor walks a
    contiguous slice of that serial stream, so its noise varies like real audio.
  - Every other field (temperature, humidity, battery, light, pressure, SEN5X
    PM/PN, particle size, AS7331 UV): a plausible RANDOM value (per-sensor
    baseline + small per-second jitter, so it doesn't jump around).

Output: one JSON with a flat `readings` array (sensorId + recordedAt + all fields).

Usage:
  python generate_full_mock.py --bands bands.csv --sensors 50 --seconds 120 \
      --out ../../src/lib/fullSensorMock.json
"""
import argparse
import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

# noiseClass is a MASKING PREDICTION over these 4 classes (nearest mask on band
# tilt), or None when the nearest mask is beyond that class's distance threshold.
TARGET_CLASSES = ["siren", "dog_bark", "car_horn", "drilling"]

BAND_COLS = ["noise_low", "noise_250", "noise_500", "noise_1k", "noise_2k", "noise_4k", "noise_8k"]
# csv column -> output JSON key
BAND_KEY = {"noise_low": "noiseLow", "noise_250": "noise250", "noise_500": "noise500",
            "noise_1k": "noise1k", "noise_2k": "noise2k", "noise_4k": "noise4k", "noise_8k": "noise8k"}
START = datetime(2026, 7, 27, 8, 0, 0, tzinfo=timezone.utc)


def predict_by_masks(noise, pct=75):
    """Masking classifier over TARGET_CLASSES on offset-safe band tilt.
    Returns one prediction per row: a class name, or None if the nearest mask is
    farther than that class's `pct`-percentile in-class distance (its threshold)."""
    X = noise[BAND_COLS].to_numpy()
    tilt = X - X.mean(axis=1, keepdims=True)          # shape only, offset-safe
    cls = noise["class"].to_numpy()
    masks, thr = [], []
    for c in TARGET_CLASSES:
        members = tilt[cls == c]
        m = members.mean(axis=0)
        masks.append(m)
        thr.append(np.percentile(np.linalg.norm(members - m, axis=1), pct))
    masks, thr = np.array(masks), np.array(thr)        # (4,7), (4,)
    dists = np.linalg.norm(tilt[:, None, :] - masks[None, :, :], axis=2)  # (n,4)
    j = dists.argmin(axis=1)
    nearest = dists[np.arange(len(dists)), j]
    return [TARGET_CLASSES[j[k]] if nearest[k] <= thr[j[k]] else None for k in range(len(j))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bands", default="bands.csv")
    ap.add_argument("--sensors", type=int, default=50)
    ap.add_argument("--seconds", type=int, default=120, help="seconds of history per sensor")
    ap.add_argument("--out", default="../../src/lib/fullSensorMock.json")
    ap.add_argument("--pct", type=int, default=75, help="None threshold percentile (balanced=75)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    noise = pd.read_csv(args.bands)          # serial per-second noise stream (real)
    n_noise = len(noise)
    dba = noise["noise_dba"].to_numpy()
    bands = noise[BAND_COLS].to_numpy()
    pred_class = predict_by_masks(noise, args.pct)   # masking result per row (class or None)

    readings = []
    for s in range(args.sensors):
        sid = f"sck-{s + 1:02d}"
        rng = np.random.default_rng(args.seed + s)
        # per-sensor baselines for the slow-moving / random fields
        t0, h0, p0 = rng.uniform(22, 32), rng.uniform(30, 55), rng.uniform(99.5, 101.5)
        batt0, light0 = rng.uniform(60, 100), rng.uniform(80, 400)
        pm0, pn0 = rng.uniform(8, 35), rng.uniform(8000, 22000)
        for t in range(args.seconds):
            i = (s * args.seconds + t) % n_noise        # serial slice of the noise stream
            pm1 = max(0.0, pm0 + rng.normal(0, 2))
            pm25 = pm1 + rng.uniform(0, 3); pm4 = pm25 + rng.uniform(0, 1); pm10 = pm4 + rng.uniform(0, 0.6)
            pn05 = max(0.0, pn0 + rng.normal(0, 800))
            pn1 = pn05 * 1.15; pn25 = pn1 * 1.01; pn4 = pn25 * 1.003; pn10 = pn4 * 1.001
            readings.append({
                "sensorId": sid,
                "recordedAt": (START + timedelta(seconds=t)).isoformat().replace("+00:00", "Z"),
                # --- real, from the audio ---
                "noiseDba": round(float(dba[i]), 2),
                **{BAND_KEY[c]: round(float(v), 2) for c, v in zip(BAND_COLS, bands[i])},
                "noiseClass": pred_class[i],   # masking prediction (or None)
                # --- plausible random ---
                "temperature": round(t0 + rng.normal(0, 0.3), 2),
                "humidity": round(float(np.clip(h0 + rng.normal(0, 1.5), 0, 100)), 2),
                "battery": int(np.clip(batt0 - t * 0.002 + rng.normal(0, 0.2), 0, 100)),
                "sdCard": 1,
                "lightLux": int(max(0, light0 + rng.normal(0, 15))),
                "pressureKpa": round(p0 + rng.normal(0, 0.04), 2),
                "pm1": round(pm1, 2), "pm25": round(pm25, 2), "pm4": round(pm4, 2), "pm10": round(pm10, 2),
                "pn05": round(pn05, 2), "pn1": round(pn1, 2), "pn25": round(pn25, 2),
                "pn4": round(pn4, 2), "pn10": round(pn10, 2),
                "tps": round(rng.uniform(0.40, 0.60), 2),
                "uvA": round(max(0, rng.normal(0.06, 0.03)), 2),
                "uvB": round(max(0, rng.normal(0.02, 0.02)), 2),
                "uvC": round(max(0, rng.normal(0.05, 0.02)), 2),
            })

    out = {
        "_note": "noise bands+dBA are real (UrbanSound8K via minimal_bands, per second); noiseClass is a masking prediction over siren/dog_bark/car_horn/drilling (or None); other fields are plausible random.",
        "sensors": [f"sck-{i + 1:02d}" for i in range(args.sensors)],
        "secondsPerSensor": args.seconds,
        "readings": readings,
    }
    with open(args.out, "w") as f:
        json.dump(out, f)
    print(f"wrote {len(readings)} readings ({args.sensors} sensors x {args.seconds}s) -> {args.out}")


if __name__ == "__main__":
    main()

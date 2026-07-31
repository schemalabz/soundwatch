"""
Reduce UrbanSound8K to the 7 firmware bands (+ dBA) -> CSV, ONE ROW PER SECOND,
using minimal_bands.py (the canonical, sensor-faithful sound processing).

Each clip is sliced into 1-second chunks (~86 x 512-sample frames @ 44.1 kHz) —
matching the real sensor's 1 s reading cadence — and each second becomes a row:
  file, fold, class, second, noise_dba, noise_low..noise_8k

Usage:
  python reduce_urbansound.py --dataset data/UrbanSound8K --out bands.csv
  python reduce_urbansound.py --dataset data/UrbanSound8K --out bands.csv --limit 10

Requires: numpy, scipy, soundfile, pandas   (pip install -r requirements.txt)
"""
import argparse
import os
import random

import numpy as np
import pandas as pd
import soundfile as sf

from minimal_bands import (
    resampling_frequency, buffer_frames, dc_removal, scale_and_window,
    fft_magnitudes, bands_capture, dba_capture,
)

SR = 44100
NFFT = 512
FRAMES_PER_SEC = SR // NFFT  # ~86 frames = 1 second

# CSV band columns, aligned to minimal_bands.LABELS order and the backend field map.
BAND_COLS = ["noise_low", "noise_250", "noise_500", "noise_1k", "noise_2k", "noise_4k", "noise_8k"]


def clip_to_seconds(path):
    """Yield (second_index, dBA, [7 bands]) for each 1-second chunk of the clip."""
    audio, sr = sf.read(path)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)               # mono, like the single-mic sensor
    audio = resampling_frequency(audio, sr, SR)
    frames = buffer_frames(audio, NFFT)
    if len(frames) == 0:
        return
    mags = fft_magnitudes(scale_and_window(dc_removal(frames), NFFT))
    for start in range(0, len(mags), FRAMES_PER_SEC):
        chunk = mags[start:start + FRAMES_PER_SEC]   # the frames within this second
        if len(chunk) == 0:
            continue
        yield start // FRAMES_PER_SEC, dba_capture(chunk, SR, NFFT), bands_capture(chunk)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="data/UrbanSound8K")
    ap.add_argument("--out", default="bands.csv")
    ap.add_argument("--limit", type=int, default=0, help="max clips per fold (0 = all)")
    ap.add_argument("--no-shuffle", action="store_true",
                    help="keep dataset order; default shuffles clips into a mixed stream "
                         "(each clip's seconds stay together and in order)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    meta = pd.read_csv(os.path.join(args.dataset, "metadata", "UrbanSound8K.csv"))
    clips, per_fold = [], {}   # clips = list of per-clip row lists (seconds kept in order)

    for _, r in meta.iterrows():
        fold = int(r["fold"])
        if args.limit and per_fold.get(fold, 0) >= args.limit:
            continue
        path = os.path.join(args.dataset, "audio", f"fold{fold}", r["slice_file_name"])
        if not os.path.exists(path):
            continue
        try:
            clip_rows = [{"file": r["slice_file_name"], "fold": fold, "class": r["class"],
                          "second": sec, "noise_dba": round(float(dba), 2),
                          **{c: round(float(v), 2) for c, v in zip(BAND_COLS, bands)}}
                         for sec, dba, bands in clip_to_seconds(path)]
        except Exception as e:  # noqa: BLE001 - a few dataset files are unreadable
            print("skip", path, e)
            continue
        if clip_rows:
            clips.append(clip_rows)
        per_fold[fold] = per_fold.get(fold, 0) + 1

    # Shuffle the CLIPS into a realistic mixed stream (drill-clip, dog_bark-clip, ...);
    # each clip's seconds stay together and in order.
    if not args.no_shuffle:
        random.Random(args.seed).shuffle(clips)
    rows = [row for clip in clips for row in clip]
    for i, row in enumerate(rows):
        row["seq"] = i  # position in the mixed stream

    cols = ["seq", "file", "fold", "class", "second", "noise_dba"] + BAND_COLS
    df = pd.DataFrame(rows)[cols]
    df.to_csv(args.out, index=False)
    print(f"wrote {len(df)} per-second rows from {sum(per_fold.values())} clips -> {args.out}\n")
    print("mean band dB per class:")
    print(df.groupby("class")[BAND_COLS].mean().round(1))


if __name__ == "__main__":
    main()

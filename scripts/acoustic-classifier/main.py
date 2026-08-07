#!/usr/bin/env python3
"""CLI for the SCK acoustic-classification research + evaluation tool.

Subcommands:
    download    Print UrbanSound8K placement instructions; optionally clone ESC-50.
    verify      Report which target classes actually exist in each dataset.
    selftest    Run the DSP/emulator faithfulness tests (no dataset needed).
    demo        Emulate synthetic signals through every config (no dataset needed).
    extract     Emulate + cache device-realistic features for one/all configs.
    train       Cross-validate a single config and print metrics + importances.
    compare     Run the full ablation -> master table, confusion PNGs, conclusion.

Everything is seeded and deterministic; features are cached under results/cache/.
"""

from __future__ import annotations

import argparse
import sys

import numpy as np

from acoustic.config import CONFIGS
from acoustic.datasets import DATA_ROOT


def cmd_download(args: argparse.Namespace) -> int:
    from acoustic import download
    download.instructions(args.data)
    if args.esc50:
        download.fetch_esc50(args.data)
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    from acoustic.datasets import verify
    verify(args.data)
    return 0


def cmd_selftest(_: argparse.Namespace) -> int:
    import pytest
    return pytest.main(["-q", "tests/"])


def cmd_demo(_: argparse.Namespace) -> int:
    """Push three synthetic signals through every config -- proves the pipeline
    end-to-end with no dataset: a 60 Hz truck-like rumble, a 3 kHz tone, and a
    5 Hz-pulsed jackhammer-like burst train."""
    from acoustic.features import extract_features
    sr = 44100
    t = np.arange(sr) / sr
    rng = np.random.default_rng(0)
    signals = {
        "rumble_60Hz": np.sin(2 * np.pi * 60 * t) + 0.3 * np.sin(2 * np.pi * 120 * t),
        "tone_3kHz": np.sin(2 * np.pi * 3000 * t),
        "jackhammer_5Hz": (np.sin(2 * np.pi * 2500 * t)
                           * (rng.standard_normal(sr) * 0.2 + 1.0)
                           * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 5 * t)))),
    }
    for cname in ["A", "B", "C", "A+T", "B+T"]:
        cfg = CONFIGS[cname]
        print(f"\n=== Config {cname}: {cfg.nfft}-pt, {cfg.n_bands} bands, "
              f"{'temporal' if cfg.temporal else 'static'}, "
              f"frame_rate={cfg.frame_rate_hz:.0f}Hz, "
              f"max_mod={cfg.max_modulation_hz:.0f}Hz ===")
        for sig_name, x in signals.items():
            vec, names = extract_features(x, cfg)
            print(f"  {sig_name:16s} -> {len(vec)} features, "
                  f"e.g. {names[0]}={vec[0]:.2f}")
    return 0


def _load_or_exit(args: argparse.Namespace):
    from acoustic.experiment import load_clips
    clips = load_clips(with_esc50=args.esc50, with_other=args.with_other, root=args.data)
    if not clips:
        print("\nNo clips loaded -- see instructions above. Aborting.")
        sys.exit(2)
    return clips


def cmd_extract(args: argparse.Namespace) -> int:
    from acoustic.model import extract_dataset
    clips = _load_or_exit(args)
    names = [args.config] if args.config else list(CONFIGS.keys())
    for name in names:
        extract_dataset(CONFIGS[name], clips, use_cache=not args.no_cache)
    return 0


def cmd_train(args: argparse.Namespace) -> int:
    from acoustic.model import cross_validate, extract_dataset, top_importances
    clips = _load_or_exit(args)
    cfg = CONFIGS[args.config]
    fs = extract_dataset(cfg, clips, use_cache=not args.no_cache)
    for kind in ("coarse", "fine"):
        cv = cross_validate(fs, label_kind=kind, model_kind=args.model)
        print(f"\n[{cfg.name}] {kind}: acc={cv.accuracy:.3f} macroF1={cv.macro_f1:.3f}")
        print(f"  labels: {cv.labels}")
        print(f"  confusion:\n{cv.confusion}")
        if kind == "fine":
            for fname, val in top_importances(cv, k=10):
                print(f"    {val:.3f}  {fname}")
    return 0


def cmd_compare(args: argparse.Namespace) -> int:
    from acoustic.experiment import run_and_report
    clips = _load_or_exit(args)
    run_and_report(clips, model_kind=args.model, use_cache=not args.no_cache)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", default=DATA_ROOT, help="dataset root (default: %(default)s)")
    p.add_argument("--esc50", action="store_true", help="include/clone ESC-50 foils")
    p.add_argument("--with-other", action="store_true",
                   help="add non-machinery UrbanSound8K foils to the coarse 'other' class")
    p.add_argument("--no-cache", action="store_true", help="ignore cached features")
    p.add_argument("--model", default="rf", choices=["rf", "logreg"],
                   help="classifier (default: %(default)s)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("download", help="dataset instructions / fetch ESC-50").set_defaults(func=cmd_download)
    sub.add_parser("verify", help="which target classes exist").set_defaults(func=cmd_verify)
    sub.add_parser("selftest", help="run emulator faithfulness tests").set_defaults(func=cmd_selftest)
    sub.add_parser("demo", help="emulate synthetic signals (no data needed)").set_defaults(func=cmd_demo)

    pe = sub.add_parser("extract", help="cache features for a config (or all)")
    pe.add_argument("--config", choices=list(CONFIGS.keys()), help="default: all")
    pe.set_defaults(func=cmd_extract)

    pt = sub.add_parser("train", help="cross-validate one config")
    pt.add_argument("--config", required=True, choices=list(CONFIGS.keys()))
    pt.set_defaults(func=cmd_train)

    sub.add_parser("compare", help="full ablation + master table + conclusion").set_defaults(func=cmd_compare)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

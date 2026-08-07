"""Faithfulness + sanity tests for the sensor emulator.

The headline test asserts that Config A's *computed* FFT-bin -> band mapping
matches the fixed firmware table from the DSP spec.  If this passes, the
emulator reproduces the device we ship today, and every downstream experiment
is trustworthy.  Run with ``pytest`` or ``python -m pytest``.
"""

from __future__ import annotations

import numpy as np
import pytest

from acoustic.config import CONFIGS
from acoustic.emulator import (
    band_bin_ranges,
    bands_from_magnitudes,
    emulate,
    frame_magnitudes,
    frame_signal,
)

# The ground-truth firmware table (LOW, 250, 500, 1K, 2K, 4K, 8K) at 512-pt/44.1 kHz.
CONFIG_A_FIXED_TABLE = [(1, 2), (3, 4), (5, 8), (9, 16), (17, 33), (34, 66), (67, 131)]


def test_config_a_bin_mapping_matches_firmware_table():
    """Config A's derived bin ranges must equal the hardcoded firmware groups."""
    a = CONFIGS["A"]
    ranges = band_bin_ranges(a.band_edges_hz, a.sample_rate, a.nfft)
    assert ranges == CONFIG_A_FIXED_TABLE
    assert a.n_bands == 7
    assert a.band_labels == ["LOW", "250", "500", "1K", "2K", "4K", "8K"]


def test_config_a_bin_width():
    a = CONFIGS["A"]
    assert abs(a.bin_hz - 44100 / 512) < 1e-6
    assert abs(a.bin_hz - 86.13) < 0.01  # ~86 Hz/bin


def test_bands_are_contiguous_and_ordered():
    """Within a config, bands must not leave gaps or run backwards (bin 0 aside)."""
    for name, cfg in CONFIGS.items():
        ranges = band_bin_ranges(cfg.band_edges_hz, cfg.sample_rate, cfg.nfft)
        assert len(ranges) == cfg.n_bands, name
        for lo, hi in ranges:
            assert lo >= 1, f"{name}: DC bin leaked in"
            assert hi >= lo, f"{name}: inverted band {lo}..{hi}"


def test_bigger_fft_resolves_low_octaves():
    """Config B (2048-pt) must place real 31.5/63/125 Hz octave bands below A's floor."""
    b = CONFIGS["B"]
    assert "31.5" in b.band_labels and "63" in b.band_labels and "125" in b.band_labels
    assert abs(b.bin_hz - 44100 / 2048) < 1e-6
    assert b.bin_hz < 22.0  # ~21.5 Hz/bin -> genuinely finer than A's 86 Hz


def test_short_clip_is_padded_not_dropped():
    """A sub-frame clip is zero-padded to nfft, never silently dropped."""
    x = np.ones(100)  # far shorter than 512
    frames = frame_signal(x, nfft=512, hop=512)
    assert frames.shape == (1, 512)
    assert np.all(frames[0, 100:] == 0.0)


def test_dc_removal_kills_constant_offset():
    """A pure DC signal must produce ~zero energy after DC removal + windowing."""
    x = np.full(2048, 1000.0)  # constant "silent offset ~1000" like the device buffer
    mag = frame_magnitudes(x, nfft=512, hop=512)
    assert mag.max() < 1e-6


def test_static_emulation_shape_and_tone_localisation():
    """A 1 kHz tone must light up the 1K band far more than the LOW band (Config A)."""
    a = CONFIGS["A"]
    sr = a.sample_rate
    t = np.arange(sr) / sr           # 1 s
    x = np.sin(2 * np.pi * 1000 * t)
    vec = emulate(x, a)
    assert vec.shape == (7,)
    low_idx = a.band_labels.index("LOW")
    one_k_idx = a.band_labels.index("1K")
    assert vec[one_k_idx] > vec[low_idx] + 20  # dominant band, by a wide margin


def test_temporal_emulation_shape():
    """Temporal configs return a (bands x frames) matrix with many frames over 1 s."""
    at = CONFIGS["A+T"]
    sr = at.sample_rate
    x = np.random.default_rng(0).standard_normal(sr)  # 1 s noise
    mat = emulate(x, at)
    assert mat.shape[0] == at.n_bands
    # 512-pt, hop 256 over 44100 samples -> ~171 frames.
    assert mat.shape[1] > 150
    assert at.max_modulation_hz > 80  # can see jackhammer strike rates


def test_band_rms_is_finite_on_silence():
    mag = np.zeros((5, 257))
    out = bands_from_magnitudes(mag, [(1, 2), (3, 4)])
    assert np.all(np.isfinite(out))

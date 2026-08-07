"""Config-driven sensor emulator -- the heart of the tool.

Takes any full-quality audio clip and reprocesses it into exactly what the SCK
device would publish for a given :class:`~acoustic.config.SensorConfig`, so the
classifier is trained on device-realistic band energies rather than the
original hi-fi audio.

The pipeline mirrors the on-device DSP diagram:

    load + resample + mono
      -> frame (nfft, hop)
      -> per frame: DC removal (subtract mean), Hann window, real FFT -> |bins|
      -> map bins -> bands (bin ranges computed from sample_rate/nfft/edges)
      -> per band: RMS across bins -> dB
      -> static: one vector/clip  |  temporal: bands x frames matrix

Every function here is small and pure so the emulator is unit-testable; the
Config-A bin-mapping assertion in ``tests/`` proves faithfulness before any
experiment runs.

Note on the band branch: it is intentionally **not** A-weighted.  Preserving
low-frequency energy is what lets a truck rumble separate from a bright motor.
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np

from .config import SensorConfig

EPS = 1e-12  # floor for logs / divisions; keeps dB finite on digital silence


# ---------------------------------------------------------------------------
# Pure DSP helpers
# ---------------------------------------------------------------------------
def edge_bins(band_edges_hz: List[float], sample_rate: int, nfft: int) -> List[int]:
    """Convert band edge frequencies to FFT bin indices.

    Uses ``round(f / bin_hz)`` -- rounding to the *nearest* bin.  This is the
    rule that faithfully reproduces the firmware's fixed table (in particular it
    is what puts bin 33 in the 2K band rather than 4K at 512-pt/44.1 kHz, where
    a plain floor/geometric-mean split would disagree).
    """
    bin_hz = sample_rate / nfft
    return [int(round(f / bin_hz)) for f in band_edges_hz]


def band_bin_ranges(band_edges_hz: List[float], sample_rate: int, nfft: int
                    ) -> List[Tuple[int, int]]:
    """Inclusive ``(lo_bin, hi_bin)`` FFT-bin range for each band.

    Bin 0 (DC) is always excluded -- the first usable bin is 1.  Bands are
    contiguous: band *i* spans ``edge_bins[i]+1 .. edge_bins[i+1]``.

    Degenerate case: at coarse resolution (e.g. third-octaves below ~40 Hz on a
    2048-pt FFT) a band can be narrower than one bin, giving ``hi < lo``.  We
    clamp such a band to the single nearest bin (``lo == hi``); neighbouring
    sub-resolution bands then share that bin.  This is physically honest -- you
    cannot resolve a 25 Hz third-octave with 21.5 Hz bins -- and is part of why
    Config C's low bands add little information.
    """
    ebins = edge_bins(band_edges_hz, sample_rate, nfft)
    n_rfft_bins = nfft // 2 + 1
    ranges: List[Tuple[int, int]] = []
    for i in range(len(ebins) - 1):
        lo = max(ebins[i] + 1, 1)
        hi = ebins[i + 1]
        hi = min(hi, n_rfft_bins - 1)
        if hi < lo:  # sub-bin-resolution band: snap to the nearest single bin
            snap = min(max(lo, 1), n_rfft_bins - 1)
            lo = hi = snap
        ranges.append((lo, hi))
    return ranges


def frame_signal(x: np.ndarray, nfft: int, hop: int) -> np.ndarray:
    """Slice ``x`` into overlapping frames of length ``nfft``.

    Signals shorter than one frame are zero-padded up to ``nfft`` (documented
    behaviour -- we never silently drop short clips).  Returns a
    ``(n_frames, nfft)`` array.
    """
    if len(x) < nfft:
        x = np.pad(x, (0, nfft - len(x)))
    n_frames = 1 + (len(x) - nfft) // hop
    # Strided gather of frame start indices -> explicit 2-D index matrix.
    starts = hop * np.arange(n_frames)[:, None]
    idx = starts + np.arange(nfft)[None, :]
    return x[idx]


_HANN_CACHE: "dict[int, np.ndarray]" = {}


def hann_window(nfft: int) -> np.ndarray:
    """Periodic Hann window (matches the device's edge-fading step), cached."""
    if nfft not in _HANN_CACHE:
        n = np.arange(nfft)
        _HANN_CACHE[nfft] = 0.5 - 0.5 * np.cos(2.0 * np.pi * n / nfft)
    return _HANN_CACHE[nfft]


def frame_magnitudes(x: np.ndarray, nfft: int, hop: int) -> np.ndarray:
    """Per-frame magnitude spectrum: DC removal -> Hann -> |rFFT|.

    Returns ``(n_frames, nfft//2 + 1)``.  DC removal subtracts each frame's own
    mean (the device's "subtract the silent offset ~1000" step).
    """
    frames = frame_signal(x, nfft, hop).astype(np.float64)
    frames = frames - frames.mean(axis=1, keepdims=True)   # DC removal
    frames = frames * hann_window(nfft)                    # window edges to 0
    return np.abs(np.fft.rfft(frames, axis=1))


def bands_from_magnitudes(mag: np.ndarray, ranges: List[Tuple[int, int]]) -> np.ndarray:
    """Collapse an FFT magnitude spectrogram to per-band **linear** RMS energy.

    ``mag`` is ``(n_frames, n_bins)``; returns ``(n_frames, n_bands)`` of RMS
    magnitude within each band.  RMS (root of the mean squared bin magnitude)
    is used rather than a plain sum so that bands with different bin counts are
    comparable -- this mirrors the firmware's per-group "square -> average ->
    sqrt" step.
    """
    n_frames = mag.shape[0]
    out = np.empty((n_frames, len(ranges)), dtype=np.float64)
    for b, (lo, hi) in enumerate(ranges):
        seg = mag[:, lo:hi + 1]
        out[:, b] = np.sqrt(np.mean(seg ** 2, axis=1) + EPS)
    return out


def to_db(linear: np.ndarray) -> np.ndarray:
    """Consistent linear-RMS -> dB transform used across every config.

    ``20*log10`` of RMS magnitude.  We do not apply the device's absolute
    SPL calibration (the ``120 - (144.5 - ...)`` offset) because it is a
    constant shift that cancels for a classifier; keeping the transform simple
    and identical across configs is what makes their features comparable.
    """
    return 20.0 * np.log10(linear + EPS)


# ---------------------------------------------------------------------------
# Top-level emulation
# ---------------------------------------------------------------------------
def emulate(x: np.ndarray, cfg: SensorConfig) -> np.ndarray:
    """Reprocess a mono clip (already at ``cfg.sample_rate``) into band energies.

    Returns:
        * static config  -> shape ``(n_bands,)`` -- one representative dB vector
          for the clip (band energies averaged over frames in the power domain,
          then converted to dB).
        * temporal config -> shape ``(n_bands, n_frames)`` -- per-band **linear**
          RMS envelopes over time, ready for temporal statistics.

    The band ranges are computed once from the config; nothing is hardcoded.
    """
    ranges = band_bin_ranges(cfg.band_edges_hz, cfg.sample_rate, cfg.nfft)
    mag = frame_magnitudes(x, cfg.nfft, cfg.hop)
    lin_bands = bands_from_magnitudes(mag, ranges)  # (n_frames, n_bands)

    if not cfg.temporal:
        # Collapse to one vector: average power across frames, then dB.
        mean_power = np.mean(lin_bands ** 2, axis=0)
        return to_db(np.sqrt(mean_power + EPS))

    # Temporal: return (n_bands, n_frames) linear envelopes; features.py derives
    # dB / crest / modulation stats from these.
    return lin_bands.T


def config_a_bin_table(sample_rate: int = 44100, nfft: int = 512) -> List[Tuple[int, int]]:
    """The firmware's fixed Config-A bin groupings, recomputed from edges.

    Exposed for the faithfulness test; should equal
    ``[(1,2),(3,4),(5,8),(9,16),(17,33),(34,66),(67,131)]``.
    """
    from .config import CONFIGS
    a = CONFIGS["A"]
    return band_bin_ranges(a.band_edges_hz, sample_rate, nfft)

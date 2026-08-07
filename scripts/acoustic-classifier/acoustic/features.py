"""Feature extraction on top of emulated band energies.

Two regimes, matching the config:

* **Static** (A, B, C): the per-clip band-energy dB vector plus two whole-clip
  spectral descriptors derived from the bands -- spectral tilt (low minus high)
  and band spectral centroid.

* **Temporal** (A+T, B+T): the 1 s clip is framed at 50 % overlap; for each band
  we summarise the envelope over time with statistics that expose *modulation*
  rather than static level -- variance, crest factor (impulsiveness), plus a
  global spectral flux and per-band modulation rate / onset rate.  A steady
  truck rumble and a revving/impacting motor separate here, not on mean energy.

All feature vectors come with parallel human-readable names so the classifier's
feature importances can be read back as "which band / which statistic".
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np

from .config import SensorConfig
from .emulator import EPS, band_bin_ranges, emulate, to_db

# Modulation search band (Hz).  Jackhammer/drill strike & engine rev rates live
# here; the upper edge is clamped per-config to the frame-rate Nyquist.
MOD_LO_HZ = 4.0
MOD_HI_HZ = 80.0


# ---------------------------------------------------------------------------
# Static descriptors
# ---------------------------------------------------------------------------
def band_center_freqs(cfg: SensorConfig) -> np.ndarray:
    """Geometric-mean centre frequency of each band, for centroid/tilt maths."""
    edges = cfg.band_edges_hz
    centers = []
    for i in range(len(edges) - 1):
        lo = max(edges[i], edges[1] * 0.5)  # avoid log(0) for the LOW band's 0 edge
        hi = edges[i + 1]
        centers.append((lo * hi) ** 0.5)
    return np.asarray(centers)


def spectral_tilt(db_vec: np.ndarray) -> float:
    """Low-band minus high-band level (dB).  Positive => bass-heavy (truck-like)."""
    n = len(db_vec)
    k = max(1, n // 3)
    return float(np.mean(db_vec[:k]) - np.mean(db_vec[-k:]))


def spectral_centroid(db_vec: np.ndarray, centers: np.ndarray) -> float:
    """Energy-weighted mean band frequency (Hz).  Bright sources sit higher."""
    lin = 10.0 ** (db_vec / 20.0)  # back to linear energy for a physical centroid
    w = lin.sum()
    if w <= EPS:
        return float(centers[0])
    return float(np.sum(centers * lin) / w)


def static_features(db_vec: np.ndarray, cfg: SensorConfig) -> Tuple[np.ndarray, List[str]]:
    centers = band_center_freqs(cfg)
    tilt = spectral_tilt(db_vec)
    centroid = spectral_centroid(db_vec, centers)
    vec = np.concatenate([db_vec, [tilt, centroid]])
    names = [f"band[{lbl}]_dB" for lbl in cfg.band_labels] + ["spectral_tilt", "spectral_centroid"]
    return vec.astype(np.float64), names


# ---------------------------------------------------------------------------
# Temporal statistics (per band envelope)
# ---------------------------------------------------------------------------
def crest_factor(lin_env: np.ndarray) -> float:
    """peak / RMS of the linear envelope -> impulsiveness (high for jackhammers)."""
    rms = np.sqrt(np.mean(lin_env ** 2) + EPS)
    return float(np.max(lin_env) / (rms + EPS))


def modulation_rate(lin_env: np.ndarray, frame_rate_hz: float,
                    lo_hz: float = MOD_LO_HZ, hi_hz: float = MOD_HI_HZ) -> float:
    """Dominant envelope periodicity in [lo, hi] Hz via autocorrelation.

    Returns the frequency (Hz) of the strongest modulation peak, or 0.0 if the
    envelope is too short / featureless.  The search window is clamped to the
    frame-rate Nyquist, so coarse (2048-pt) configs honestly report a lower
    ceiling than 512-pt configs.
    """
    n = len(lin_env)
    if n < 4:
        return 0.0
    hi_hz = min(hi_hz, frame_rate_hz / 2.0)
    if hi_hz <= lo_hz:
        return 0.0
    env = lin_env - lin_env.mean()
    if np.all(np.abs(env) < EPS):
        return 0.0
    ac = np.correlate(env, env, mode="full")[n - 1:]  # non-negative lags
    ac = ac / (ac[0] + EPS)
    lag_lo = max(1, int(np.floor(frame_rate_hz / hi_hz)))
    lag_hi = min(n - 1, int(np.ceil(frame_rate_hz / lo_hz)))
    if lag_hi <= lag_lo:
        return 0.0
    window = ac[lag_lo:lag_hi + 1]
    best_lag = lag_lo + int(np.argmax(window))
    if best_lag <= 0:
        return 0.0
    return float(frame_rate_hz / best_lag)


def onset_rate(db_env: np.ndarray, frame_rate_hz: float) -> float:
    """Upward threshold crossings per second (mean + 1 sd) -> event/strike rate."""
    n = len(db_env)
    if n < 2:
        return 0.0
    thr = db_env.mean() + db_env.std()
    above = db_env > thr
    crossings = int(np.sum((~above[:-1]) & (above[1:])))
    duration_s = n / frame_rate_hz
    return float(crossings / (duration_s + EPS))


def active_fraction(db_env: np.ndarray) -> float:
    """Fraction of frames above (max - 10 dB) -> sustained vs bursty activity."""
    if len(db_env) == 0:
        return 0.0
    thr = db_env.max() - 10.0
    return float(np.mean(db_env > thr))


def spectral_flux(lin_bands_ft: np.ndarray) -> float:
    """Mean over frames of sum_b max(e_b[n]-e_b[n-1], 0)^2 -> rate of spectral change.

    ``lin_bands_ft`` is ``(n_bands, n_frames)`` linear energy.  Fluctuating /
    revving sources have high flux; a steady idle has near-zero flux.
    """
    if lin_bands_ft.shape[1] < 2:
        return 0.0
    diff = np.diff(lin_bands_ft, axis=1)
    pos = np.clip(diff, 0.0, None)
    return float(np.mean(np.sum(pos ** 2, axis=0)))


def temporal_features(lin_bands_ft: np.ndarray, cfg: SensorConfig
                      ) -> Tuple[np.ndarray, List[str]]:
    """Per-band time statistics concatenated into one vector (~bands x 6 + 1)."""
    db_bands = to_db(lin_bands_ft)              # (n_bands, n_frames)
    fr = cfg.frame_rate_hz
    feats: List[float] = []
    names: List[str] = []
    for b, lbl in enumerate(cfg.band_labels):
        lin_env = lin_bands_ft[b]
        db_env = db_bands[b]
        stats = {
            "mean_dB": float(db_env.mean()),
            "std_dB": float(db_env.std()),
            "var_dB": float(db_env.var()),
            "crest": crest_factor(lin_env),
            "modrate_Hz": modulation_rate(lin_env, fr),
            "onset_rate": onset_rate(db_env, fr),
            "active_frac": active_fraction(db_env),
        }
        for key, val in stats.items():
            feats.append(val)
            names.append(f"band[{lbl}]_{key}")
    feats.append(spectral_flux(lin_bands_ft))
    names.append("spectral_flux")
    return np.asarray(feats, dtype=np.float64), names


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
def extract_features(x: np.ndarray, cfg: SensorConfig) -> Tuple[np.ndarray, List[str]]:
    """Emulate ``x`` under ``cfg`` and return (feature_vector, feature_names)."""
    emu = emulate(x, cfg)
    if cfg.temporal:
        return temporal_features(emu, cfg)
    return static_features(emu, cfg)


def feature_names(cfg: SensorConfig) -> List[str]:
    """Feature names without needing audio -- handy for reporting/importances."""
    n_bins = cfg.nfft // 2 + 1
    n_frames = 8 if cfg.temporal else 1
    if cfg.temporal:
        dummy = np.ones((cfg.n_bands, n_frames))
        _, names = temporal_features(dummy, cfg)
    else:
        _, names = static_features(np.zeros(cfg.n_bands), cfg)
    return names

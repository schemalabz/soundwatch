"""Sensor configurations for the acoustic-classification ablation.

A :class:`SensorConfig` fully describes how a full-quality audio clip is
reprocessed into the band energies our Smart Citizen Kit (SCK) would publish.
Everything downstream (emulation, feature extraction, classification) is driven
by these objects, so the whole ablation is reproducible by name.

The five configs mirror the factorial design in the task spec:

    A     512-pt FFT, 7 fixed firmware bands, static          -> what we ship today
    B     2048-pt FFT, ~10 octave bands, static               -> value of low-freq resolution
    C     2048-pt FFT, ~27 third-octave bands, static         -> value of band count
    A+T   512-pt FFT, 7 fixed bands, temporal                 -> temporal on current hardware
    B+T   2048-pt FFT, ~10 octave bands, temporal             -> full upgrade

The band definitions are expressed as *edge frequencies* (Hz).  The emulator
turns edges into FFT bin ranges purely from ``sample_rate`` and ``nfft`` -- no
bin numbers are hardcoded except in the Config-A sanity test.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

# ---------------------------------------------------------------------------
# Standard IEC preferred centre frequencies (Hz).
# ---------------------------------------------------------------------------
# Full third-octave series 20 Hz .. 8 kHz (the band set the spec asks for).
THIRD_OCTAVE_CENTERS: List[float] = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
    630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
]

# Octave series used by Config A (250 Hz .. 8 kHz) -- these are the *centres*
# of the six upper firmware bands; a "LOW" catch-all sits below them.
OCTAVE_CENTERS_A: List[float] = [250, 500, 1000, 2000, 4000, 8000]

# Octave series for Config B, extended down to 31.5 Hz now that the 2048-pt FFT
# can (barely) resolve it.  31.5 / 63 / 125 are the octaves the spec calls out.
OCTAVE_CENTERS_B: List[float] = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000]

OCTAVE_RATIO = 2.0 ** 0.5        # half-octave: edge = centre * 2**(±1/2)
THIRD_OCTAVE_RATIO = 2.0 ** (1.0 / 6.0)  # sixth-octave: edge = centre * 2**(±1/6)


def make_band_edges(centers: List[float], ratio: float, low_catch: bool = True) -> List[float]:
    """Build band edge frequencies from a list of centre frequencies.

    Adjacent bands share an edge equal to the geometric mean of their centres,
    which is exactly ``centre * ratio`` for a logarithmically-spaced series.
    The returned list has ``len(bands) + 1`` entries.

    When ``low_catch`` is True a leading ``0.0`` edge is prepended, creating an
    extra "LOW" band that captures everything from the first usable FFT bin up
    to the lowest centre's lower edge.  This reproduces the firmware's LOW band
    (Config A) and keeps sub-bass energy that would otherwise be discarded.
    """
    centers = sorted(centers)
    internal = [(centers[i] * centers[i + 1]) ** 0.5 for i in range(len(centers) - 1)]
    lo_edge = centers[0] / ratio
    hi_edge = centers[-1] * ratio
    edges = [lo_edge] + internal + [hi_edge]
    if low_catch:
        edges = [0.0] + edges
    return edges


def make_band_labels(centers: List[float], low_catch: bool = True) -> List[str]:
    """Human-readable labels aligned with :func:`make_band_edges`."""

    def fmt(c: float) -> str:
        if c >= 1000:
            return f"{c / 1000:g}K"
        return f"{c:g}"

    labels = [fmt(c) for c in sorted(centers)]
    if low_catch:
        labels = ["LOW"] + labels
    return labels


@dataclass
class SensorConfig:
    """One point in the sensor-configuration ablation.

    Attributes mirror the on-device DSP parameters.  ``band_edges_hz`` and
    ``band_labels`` are derived from centre frequencies via
    :func:`make_band_edges` so a config is defined by *physical* quantities,
    not bin indices.
    """

    name: str
    sample_rate: int            # emulated capture rate (Hz); firmware is 44100
    nfft: int                   # FFT size (512 today, 2048 for the upgrade)
    hop: int                    # framing hop in samples (temporal analysis)
    band_edges_hz: List[float]  # len == n_bands + 1
    band_labels: List[str]      # len == n_bands
    a_weight: bool = False      # bands branch is deliberately NOT A-weighted
    temporal: bool = False      # False: 1 vector/clip; True: per-frame stats
    ram_note: str = ""          # plain-language cost annotation for the report

    @property
    def n_bands(self) -> int:
        return len(self.band_edges_hz) - 1

    @property
    def bin_hz(self) -> float:
        return self.sample_rate / self.nfft

    @property
    def frame_rate_hz(self) -> float:
        """Frames per second -> the sample rate of the band-envelope series."""
        return self.sample_rate / self.hop

    @property
    def max_modulation_hz(self) -> float:
        """Nyquist of the frame-envelope series: the fastest modulation we can
        observe.  Longer FFTs need a larger hop, which *lowers* this ceiling --
        an important, easily-missed cost of the 2048-pt temporal config."""
        return self.frame_rate_hz / 2.0


def _octave_config(name: str, nfft: int, centers: List[float], temporal: bool,
                   ram_note: str, sample_rate: int = 44100) -> SensorConfig:
    hop = nfft // 2 if temporal else nfft
    return SensorConfig(
        name=name,
        sample_rate=sample_rate,
        nfft=nfft,
        hop=hop,
        band_edges_hz=make_band_edges(centers, OCTAVE_RATIO, low_catch=True),
        band_labels=make_band_labels(centers, low_catch=True),
        temporal=temporal,
        ram_note=ram_note,
    )


def build_configs() -> "dict[str, SensorConfig]":
    """The canonical registry keyed by config name."""
    configs = [
        _octave_config(
            "A", 512, OCTAVE_CENTERS_A, temporal=False,
            ram_note="~8 KB FFT RAM (ships today); 7 numbers/reading.",
        ),
        _octave_config(
            "B", 2048, OCTAVE_CENTERS_B, temporal=False,
            ram_note="~16 KB FFT RAM (borderline on a 32 KB SAMD21); 10 numbers/reading.",
        ),
        # Config C: third-octave, 2048-pt.  low_catch=False gives exactly the
        # 27-band third-octave set the spec specifies.
        SensorConfig(
            name="C",
            sample_rate=44100,
            nfft=2048,
            hop=2048,
            band_edges_hz=make_band_edges(THIRD_OCTAVE_CENTERS, THIRD_OCTAVE_RATIO, low_catch=False),
            band_labels=make_band_labels(THIRD_OCTAVE_CENTERS, low_catch=False),
            temporal=False,
            ram_note="~16 KB FFT RAM; 27 numbers/reading -> ~4x the MQTT/Postgres volume of A.",
        ),
        _octave_config(
            "A+T", 512, OCTAVE_CENTERS_A, temporal=True,
            ram_note="~8 KB FFT RAM (no FFT change); computes per-band time stats on-device.",
        ),
        _octave_config(
            "B+T", 2048, OCTAVE_CENTERS_B, temporal=True,
            ram_note="~16 KB FFT RAM + temporal stats; the full firmware upgrade.",
        ),
    ]
    return {c.name: c for c in configs}


CONFIGS = build_configs()

"""The whole idea in one tiny function: a sound file -> 7 band numbers.

This is the minimal, readable version of what the sensor does (and what the rest
of the repo generalises). Run it directly:

    python minimal_bands.py path/to/sound.wav
"""

import sys
from math import gcd

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

# The 7 fixed firmware bands at a 512-point FFT / 44100 Hz, as (first_bin, last_bin).
# These become NOISE_LOW, 250, 500, 1K, 2K, 4K, 8K (ids 228..234) in Postgres.
BANDS = [(1, 2), (3, 4), (5, 8), (9, 16), (17, 33), (34, 66), (67, 131)]
LABELS = ["LOW", "250", "500", "1K", "2K", "4K", "8K"]


# First step: resampling_frequency (target_rate=44100Hz)
# Second step: buffer_frames
# Third step: dc_removal
# Fourth step: scale_and_window
# Fifth step: fft_magnitudes
# -> first path: 
# -> second path: 

def resampling_frequency(audio, sample_rate, target_rate=44100):
    """Resample audio from its native `sample_rate` to the device's `target_rate`
    (44100 Hz), so the FFT bins line up. Returns audio unchanged if already at rate."""
    if sample_rate == target_rate:
        return audio
    g = gcd(int(sample_rate), target_rate)
    up = target_rate // g
    down = sample_rate // g
    # inserts zeros to upsample ×(up), low-pass filters, then keeps every (down)th sample.
    return resample_poly(audio, up, down)


def buffer_frames(audio, nfft=512):
    """Chop the signal into rows of `nfft` (512) samples -- one row per snapshot the
    device would buffer and FFT. The leftover tail that can't fill a full buffer is
    dropped. Returns a (n_frames, nfft) array."""
    n_frames = len(audio) // nfft
    return audio[: n_frames * nfft].reshape(n_frames, nfft)


def dc_removal(frames):
    """Subtract each frame's own mean -- removes the constant "silent offset" so the
    band energies reflect the sound, not the buffer's baseline. Works per row."""
    return frames - frames.mean(axis=1, keepdims=True)


def scale_and_window(frames, nfft=512):
    """Scale to the device's 16-bit range and fade each frame's edges to zero (Hann).
    - Scale: soundfile gives floats in [-1, 1]; the device buffers 16-bit integers, so
      x32768 makes the dB values match real device readings (a constant +90.3 dB shift).
    - Window: tapering the edges stops the FFT from inventing fake frequencies at the
      abrupt frame cutoffs."""
    return frames * 32768.0 * np.hanning(nfft)


def fft_magnitudes(frames):
    """Real FFT of each frame -> magnitude spectrum. For 512-sample frames this gives
    257 bins (0..256), each ~86 Hz wide. Returns a (n_frames, nfft//2 + 1) array."""
    return np.abs(np.fft.rfft(frames, axis=1))


def a_weighting(freqs):
    """Standard IEC A-weighting: linear weight per frequency that mimics human hearing
    (~1.0 at 1 kHz, boosts ~4 kHz, strongly cuts the bass). Matches the diagram's
    63Hz~0.09 / 1kHz=1.0 / 4kHz~1.15 sample points."""
    f2 = np.asarray(freqs, dtype=float) ** 2
    ra = (12194.0 ** 2 * f2 ** 2) / (
        (f2 + 20.6 ** 2)
        * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
        * (f2 + 12194.0 ** 2))
    a_db = 20 * np.log10(ra + 1e-12) + 2.00
    return 10 ** (a_db / 20)


def dba_capture(mags, sample_rate=44100, nfft=512):
    """A-weight branch -> ONE dBA number (like NOISE_A / id 53).
    Weight every bin by the human-hearing curve, then take a single RMS across all bins."""
    freqs = np.fft.rfftfreq(nfft, 1.0 / sample_rate)   # centre frequency of each bin
    weighted = mags * a_weighting(freqs)
    rms = np.sqrt((weighted ** 2).mean())
    return 20 * np.log10(rms + 1e-12)


def bands_capture(mags):
    """Un-weighted branch -> the 7 band numbers (NOISE_LOW..8K / ids 228..234).
    No human-hearing curve, so the bass is kept for truck-vs-motor discrimination."""
    result = []
    for lo, hi in BANDS:
        power = (mags[:, lo:hi + 1] ** 2).mean()   # mean energy over these bins & all frames
        result.append(20 * np.log10(np.sqrt(power) + 1e-12))
    return result


def sound_to_7_bands(path, sample_rate=44100, nfft=512):
    """Load a sound file and return either the 7 band energies (a_weight=False) or the
    single dBA number (a_weight=True) the SCK would publish."""
    # mixing a stereo (or multi-channel) recording down to a single channel, because the sensor has one microphone
    audio, sr = sf.read(path)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    audio = resampling_frequency(audio, sr, sample_rate)
    frames = buffer_frames(audio, nfft)
    frames = dc_removal(frames)
    frames = scale_and_window(frames, nfft)
    mags = fft_magnitudes(frames)

    # Two branches (see the "weighting?" node in the diagram):
    dba = dba_capture(mags, sample_rate, nfft)   # A-weight branch -> one dBA
    bands = bands_capture(mags)                         # un-weighted branch -> 7 bands
    return dba, bands


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python minimal_bands.py path/to/sound.wav")
        raise SystemExit(1)
    dba, bands = sound_to_7_bands(sys.argv[1])
    print(dba)
    print("  ".join(f"{name}={val:.1f}" for name, val in zip(LABELS, bands)))

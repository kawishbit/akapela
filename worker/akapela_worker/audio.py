"""Thin wrappers over ffmpeg and ffprobe.

Every stored audio master is 44.1 kHz stereo WAV (ADR 0005).
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

BACKING_SAMPLE_RATE = 44100
BACKING_CHANNELS = 2

# Bypassed values for the two Effects (shared/adjustments.ts's REVERB_AMOUNT_MIN
# and LOWPASS_HZ_MAX). At these values a filter is left out of the graph
# entirely rather than merely configured to be neutral (ticket 07).
REVERB_AMOUNT_BYPASSED = 0
LOWPASS_HZ_BYPASSED = 20000

# Which side of a Mix the Effects colour (shared/adjustments.ts's
# EFFECTS_TARGETS). "backing" is the default, and the only behaviour there
# was before the target existed.
EFFECTS_TARGET_BACKING = "backing"
EFFECTS_TARGETS_ON_BACKING = frozenset({EFFECTS_TARGET_BACKING, "both"})
EFFECTS_TARGETS_ON_VOCAL = frozenset({"vocal", "both"})

# The one impulse response ADR 0003 requires both engines to share; the
# browser's `app/audio/engine.ts` loads the same file from `public/audio/`.
IMPULSE_RESPONSE_PATH = Path(__file__).parent / "assets" / "large-hall-ir.wav"


class AudioError(RuntimeError):
    """ffmpeg or ffprobe refused the input. The message carries the tool's own diagnostics."""


def normalize_to_backing_track(src: Path, dst: Path) -> None:
    """Decode any Source audio and write it as the 44.1 kHz stereo 16-bit WAV Backing Track."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".part.wav")
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-vn",
            "-ac",
            str(BACKING_CHANNELS),
            "-ar",
            str(BACKING_SAMPLE_RATE),
            "-c:a",
            "pcm_s16le",
            str(tmp),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        tmp.unlink(missing_ok=True)
        detail = _clean_ffmpeg_stderr(result.stderr) or f"exit code {result.returncode}"
        raise AudioError(f"ffmpeg could not decode {src.name}: {detail}")
    tmp.replace(dst)


_CONTEXT_PREFIX = re.compile(r"^\[[^\]]*\]\s*")


def _clean_ffmpeg_stderr(stderr: str) -> str:
    """Drop ffmpeg's `[in#0 @ 0x...]` context tags; a singer reading the card does not need them."""
    lines = [_CONTEXT_PREFIX.sub("", line).strip() for line in stderr.splitlines()]
    return "\n".join(line for line in lines if line)


def _append_effects(
    segments: list[str],
    *,
    label: str,
    prefix: str,
    reverb_amount: int,
    lowpass_hz: int,
    impulse_label: str,
) -> str:
    """Appends the Effects — reverb, then low-pass, the order both engines build
    them in (ADR 0003) — onto one signal's `segments`, and returns the label
    they leave it on.

    Either filter at its bypassed value contributes no segment at all, so a
    signal the Effects Target does not reach passes through exactly as it would
    have before there were Effects to apply.
    """
    if reverb_amount > REVERB_AMOUNT_BYPASSED:
        wet = reverb_amount / 100
        dry = 1 - wet
        segments.append(f"[{label}]asplit=2[{prefix}_dry][{prefix}_wet_in]")
        segments.append(f"[{prefix}_wet_in]{impulse_label}afir=dry=1:wet=1[{prefix}_wet]")
        segments.append(
            f"[{prefix}_dry][{prefix}_wet]amix=inputs=2:"
            f"weights={dry:.6f} {wet:.6f}:normalize=0[{prefix}_reverbed]"
        )
        label = f"{prefix}_reverbed"

    if lowpass_hz < LOWPASS_HZ_BYPASSED:
        segments.append(f"[{label}]lowpass=f={lowpass_hz}[{prefix}_lp]")
        label = f"{prefix}_lp"

    return label


def render_mix(
    *,
    backing: Path,
    vocal: Path,
    dst_mp3: Path,
    dst_wav: Path | None,
    tempo: float,
    pitch: float,
    vocal_wall_ms: float,
    vocal_gain: float,
    backing_gain: float,
    target_duration_ms: int,
    reverb_amount: int = REVERB_AMOUNT_BYPASSED,
    lowpass_hz: int = LOWPASS_HZ_BYPASSED,
    effects_target: str = EFFECTS_TARGET_BACKING,
) -> None:
    """Renders a Mix: the Backing Track stretched by Rubber Band, then the two
    Effects (ticket 07), then the Take's dry vocal placed at `vocal_wall_ms`
    (already converted from song time to wall time by the caller) and scaled
    by `vocal_gain`, summed with the backing scaled by `backing_gain`. The
    result always covers exactly `target_duration_ms` — the Backing Track's
    own duration is padded or trimmed to it, since Rubber Band's extreme pitch
    shifts land a few percent short of the input length on their own
    (ADR 0003, ADR 0004).

    Reverb is `afir` convolved against the bundled impulse response, always
    fully wet on its own output; the dry/wet crossfade the singer actually
    hears is an `amix` of that against an unprocessed copy, mirroring the
    convolver/dry-gain/wet-gain graph `app/audio/effects-chain.ts` builds in the
    browser. The low-pass is ffmpeg's `lowpass` filter at its default (two-pole)
    Q, matching a Web Audio `BiquadFilterNode` lowpass at its own default
    without tuning either side. Both filters are left out of the filter graph
    entirely at their bypassed values, not merely configured to be neutral, so
    a Mix rendered from an untouched Track is what phase one would have
    produced.

    `effects_target` decides which of the two signals that pair of filters
    lands on (ticket 13): the vocal, the backing, both, or neither. Each side
    builds the same two segments in the same order, so a Mix reproduces
    whichever chains the Review screen had active. The vocal's `volume` stays
    ahead of its Effects rather than after them as the backing's is; both
    filters are linear, so a scalar commutes through them exactly, and leaving
    it there keeps the default target's filter graph the string it has always
    been.

    A negative `vocal_wall_ms` means the Take started before the tempo-adjusted
    Backing Track does (a large negative nudge on an early Take); rather than
    delaying, that much is trimmed off the front of the vocal so it still lands
    at wall time zero.
    """
    dst_mp3.parent.mkdir(parents=True, exist_ok=True)
    target_seconds = target_duration_ms / 1000

    if vocal_wall_ms >= 0:
        delay_ms = round(vocal_wall_ms)
        vocal_chain = f"adelay={delay_ms}|{delay_ms},volume={vocal_gain}"
    else:
        trim_seconds = -vocal_wall_ms / 1000
        vocal_chain = f"atrim=start={trim_seconds:.6f},asetpts=PTS-STARTPTS,volume={vocal_gain}"

    on_backing = effects_target in EFFECTS_TARGETS_ON_BACKING
    on_vocal = effects_target in EFFECTS_TARGETS_ON_VOCAL
    backing_reverb = reverb_amount if on_backing else REVERB_AMOUNT_BYPASSED
    vocal_reverb = reverb_amount if on_vocal else REVERB_AMOUNT_BYPASSED

    # One impulse response input feeds at most two `afir`s, and a stream can be
    # consumed only once, so it is split when both sides want it.
    backing_wants_ir = backing_reverb > REVERB_AMOUNT_BYPASSED
    vocal_wants_ir = vocal_reverb > REVERB_AMOUNT_BYPASSED
    ir_segments: list[str] = []
    backing_ir = vocal_ir = "[2:a]"
    if backing_wants_ir and vocal_wants_ir:
        ir_segments.append("[2:a]asplit=2[ir_bg][ir_voc]")
        backing_ir, vocal_ir = "[ir_bg]", "[ir_voc]"

    backing_segments = [f"[0:a]rubberband=tempo={tempo}:pitch={pitch}[stretched]"]
    backing_label = _append_effects(
        backing_segments,
        label="stretched",
        prefix="bg",
        reverb_amount=backing_reverb,
        lowpass_hz=lowpass_hz if on_backing else LOWPASS_HZ_BYPASSED,
        impulse_label=backing_ir,
    )
    backing_segments.append(
        f"[{backing_label}]apad=whole_dur={target_seconds:.6f},atrim=end={target_seconds:.6f},"
        f"asetpts=PTS-STARTPTS,volume={backing_gain}[bg]"
    )

    vocal_segments = [f"[1:a]{vocal_chain}[voc]"]
    vocal_label = _append_effects(
        vocal_segments,
        label="voc",
        prefix="voc",
        reverb_amount=vocal_reverb,
        lowpass_hz=lowpass_hz if on_vocal else LOWPASS_HZ_BYPASSED,
        impulse_label=vocal_ir,
    )

    filter_complex = ";".join(
        [
            *ir_segments,
            *backing_segments,
            *vocal_segments,
            f"[bg][{vocal_label}]amix=inputs=2:duration=first:normalize=0[out]",
        ]
    )

    inputs = ["-i", str(backing), "-i", str(vocal)]
    if backing_wants_ir or vocal_wants_ir:
        inputs += ["-i", str(IMPULSE_RESPONSE_PATH)]

    tmp_wav = dst_mp3.with_suffix(".part.wav")
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-ar",
            str(BACKING_SAMPLE_RATE),
            "-ac",
            str(BACKING_CHANNELS),
            "-c:a",
            "pcm_s16le",
            str(tmp_wav),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        tmp_wav.unlink(missing_ok=True)
        detail = _clean_ffmpeg_stderr(result.stderr) or f"exit code {result.returncode}"
        raise AudioError(f"ffmpeg could not render the Mix: {detail}")

    tmp_mp3 = dst_mp3.with_suffix(".part.mp3")
    mp3_result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(tmp_wav),
            "-c:a",
            "libmp3lame",
            "-b:a",
            "320k",
            str(tmp_mp3),
        ],
        capture_output=True,
        text=True,
    )
    if mp3_result.returncode != 0:
        tmp_wav.unlink(missing_ok=True)
        tmp_mp3.unlink(missing_ok=True)
        detail = _clean_ffmpeg_stderr(mp3_result.stderr) or f"exit code {mp3_result.returncode}"
        raise AudioError(f"ffmpeg could not encode the Mix to MP3: {detail}")
    tmp_mp3.replace(dst_mp3)

    if dst_wav is not None:
        tmp_wav.replace(dst_wav)
    else:
        tmp_wav.unlink(missing_ok=True)


def probe_duration_ms(path: Path) -> int:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AudioError(f"ffprobe could not read {path.name}: {result.stderr.strip()}")
    try:
        seconds = float(json.loads(result.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise AudioError(f"ffprobe reported no duration for {path.name}") from exc
    return round(seconds * 1000)

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

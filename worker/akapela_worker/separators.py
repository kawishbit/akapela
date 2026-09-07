"""Separators: where a Track's Stems come from.

The separation model is to vocal removal what yt-dlp is to importing — a large
third-party thing that breaks, and that a better one will eventually replace —
so every call into it sits behind `Separator` (ADR 0008). The separate job only
sees the two-step shape: make sure the model is on disk, then run it over a
Backing Track. Tests substitute a fake; the real model never runs in the suite,
because it is a network fetch and minutes of CPU.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

log = logging.getLogger(__name__)

# The two files a separation writes, and the stem names the model declares them
# under. The job normalizes them afterwards, so nothing here promises a format.
INSTRUMENTAL_STEM_FILE = "instrumental.wav"
VOCALS_STEM_FILE = "vocals.wav"
_OUTPUT_NAMES = {"Instrumental": "instrumental", "Vocals": "vocals"}

# The MDX-Net vocal model (ADR 0008), fetched on first use rather than shipped.
MODEL_FILENAME = "UVR-MDX-NET-Inst_HQ_3.onnx"


class SeparationError(RuntimeError):
    """The Track could not be separated. The message is what the singer reads on the card."""


@dataclass(frozen=True)
class Stems:
    """Where a separation left its two outputs."""

    instrumental: Path
    vocals: Path


class Separator(Protocol):
    def fetch_model(self, models_dir: Path) -> None:
        """Put the separation model in `models_dir`, or do nothing if it is already there."""
        ...

    def separate(self, backing: Path, directory: Path, models_dir: Path) -> Stems:
        """Run the model over `backing`, writing both Stems into `directory`."""
        ...


class MdxNetSeparator:
    """The real thing: an MDX-Net model on ONNX Runtime through `audio-separator`."""

    def fetch_model(self, models_dir: Path) -> None:
        # The first separation on a machine spends minutes downloading before it
        # looks like it is doing anything, so say which model and where.
        log.info("looking for %s in %s", MODEL_FILENAME, models_dir)
        try:
            self._backend(models_dir).download_model_and_data(MODEL_FILENAME)
        except Exception as exc:
            raise SeparationError(
                f"could not download the separation model {MODEL_FILENAME}, which is fetched"
                f" from the network the first time a Track is separated: {exc}"
            ) from exc

    def separate(self, backing: Path, directory: Path, models_dir: Path) -> Stems:
        directory.mkdir(parents=True, exist_ok=True)
        backend = self._backend(models_dir, output_dir=directory)
        try:
            backend.load_model(MODEL_FILENAME)
            backend.separate(str(backing), custom_output_names=_OUTPUT_NAMES)
        except Exception as exc:
            raise SeparationError(
                f"{MODEL_FILENAME} could not separate {backing.name}: {exc}"
            ) from exc

        stems = Stems(
            instrumental=directory / INSTRUMENTAL_STEM_FILE,
            vocals=directory / VOCALS_STEM_FILE,
        )
        missing = [p.name for p in (stems.instrumental, stems.vocals) if not p.is_file()]
        if missing:
            raise SeparationError(
                f"{MODEL_FILENAME} reported success but wrote no {' or '.join(missing)}"
            )
        return stems

    def _backend(self, models_dir: Path, output_dir: Path | None = None) -> Any:
        """A fresh `audio-separator`, per call: it bakes its output directory into
        the loaded model, so one instance cannot serve two Tracks without reaching
        into its internals. Loading is seconds against a job that runs minutes.
        """
        # Imported here rather than at module scope: it pulls in torch and ONNX
        # Runtime, which a Worker that never separates should never pay for.
        from audio_separator.separator import Separator as AudioSeparator

        models_dir.mkdir(parents=True, exist_ok=True)
        return AudioSeparator(
            # Its own logging is per-chunk and relentless; ours already says which
            # Job is running and how far along it is.
            log_level=logging.WARNING,
            model_file_dir=str(models_dir),
            output_dir=str(output_dir) if output_dir is not None else None,
            output_format="WAV",
        )

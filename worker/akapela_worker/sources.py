"""Source fetchers: where a Track's audio and metadata come from.

yt-dlp breaks whenever YouTube changes under it, so every call into it sits
behind `SourceFetcher`. The import job only sees the two-step shape: learn
what the Source is, then download its audio. Tests substitute a fake.
"""

from __future__ import annotations

import logging
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from yt_dlp import YoutubeDL
from yt_dlp.utils import YoutubeDLError

log = logging.getLogger(__name__)

# Files in a Track directory: the Source audio as delivered, and the Source's own artwork.
ORIGINAL_BASENAME = "original"
COVER_BASENAME = "cover"

THUMBNAIL_TIMEOUT_SECONDS = 30
_IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class SourceError(RuntimeError):
    """The Source could not be fetched. The message is what the singer reads on the card."""


@dataclass(frozen=True)
class SourceMetadata:
    """What a Source says about itself before any audio has been downloaded."""

    title: str
    duration_ms: int | None
    # Filename of the Source's artwork written into the Track directory; None when it has none.
    cover_file: str | None


ProgressCallback = Callable[[float], None]
"""Receives the fraction (0.0 to 1.0) of the audio downloaded so far."""


class SourceFetcher(Protocol):
    def fetch_metadata(self, url: str, directory: Path) -> SourceMetadata:
        """Title, duration, and artwork, with the artwork saved into `directory`."""
        ...

    def download_audio(self, url: str, directory: Path, on_progress: ProgressCallback) -> Path:
        """Download the best audio into `directory` and return the file written."""
        ...


class YtDlpFetcher:
    """The real thing: yt-dlp as a library, with its logging routed through ours."""

    _base_options: dict[str, Any] = {
        "quiet": True,
        "noprogress": True,
        "noplaylist": True,
        "color": {"stdout": "never", "stderr": "never"},
        "logger": logging.getLogger("yt_dlp"),
        # YouTube's player challenges are solved by running JavaScript in an
        # external runtime. Node (22+) is what the image and dev machines have.
        "js_runtimes": {"node": {}},
        # Audio only when the site offers it; otherwise the best muxed file, which
        # ffmpeg strips to audio while normalizing.
        "format": "bestaudio/best",
    }

    def fetch_metadata(self, url: str, directory: Path) -> SourceMetadata:
        info = self._extract(url, download=False)
        directory.mkdir(parents=True, exist_ok=True)
        duration = info.get("duration")
        return SourceMetadata(
            title=str(info.get("title") or url),
            duration_ms=round(float(duration) * 1000) if duration is not None else None,
            cover_file=_download_thumbnail(info.get("thumbnail"), directory),
        )

    def download_audio(self, url: str, directory: Path, on_progress: ProgressCallback) -> Path:
        def hook(status: dict[str, Any]) -> None:
            if status.get("status") == "finished":
                on_progress(1.0)
            elif status.get("status") == "downloading":
                total = status.get("total_bytes") or status.get("total_bytes_estimate")
                if total:
                    on_progress(min(1.0, status.get("downloaded_bytes", 0) / total))

        info = self._extract(
            url,
            download=True,
            outtmpl=str(directory / f"{ORIGINAL_BASENAME}.%(ext)s"),
            progress_hooks=[hook],
        )
        downloads = info.get("requested_downloads") or []
        path = Path(downloads[0]["filepath"]) if downloads else None
        if path is None or not path.is_file():
            raise SourceError(f"yt-dlp reported success but wrote no audio for {url}")
        # A retry may have picked a different format than the attempt before it.
        for stale in directory.glob(f"{ORIGINAL_BASENAME}.*"):
            if stale != path:
                stale.unlink(missing_ok=True)
        return path

    def _extract(self, url: str, *, download: bool, **options: Any) -> dict[str, Any]:
        with YoutubeDL({**self._base_options, **options}) as ydl:
            try:
                info = ydl.extract_info(url, download=download)
            except YoutubeDLError as exc:
                raise SourceError(_clean_message(str(exc))) from exc
        if not info:
            raise SourceError(f"yt-dlp found nothing at {url}")
        if info.get("_type") == "playlist" or "entries" in info:
            raise SourceError(f"{url} is a playlist, not a single video")
        return info


_ERROR_PREFIX = re.compile(r"^(ERROR|WARNING):\s*")


def _clean_message(message: str) -> str:
    """yt-dlp prefixes its messages with `ERROR:`; the card already says the import failed."""
    return _ERROR_PREFIX.sub("", message.strip()) or "yt-dlp failed without a message"


def _download_thumbnail(url: object, directory: Path) -> str | None:
    """Save the Source's artwork as `cover.<ext>`. Artwork is optional, so failures only log."""
    if not isinstance(url, str) or not url:
        return None
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Akapela"})
        with urllib.request.urlopen(request, timeout=THUMBNAIL_TIMEOUT_SECONDS) as response:
            content_type = str(response.headers.get("Content-Type", "")).split(";")[0].strip()
            body = response.read()
    except (urllib.error.URLError, OSError, ValueError) as exc:
        log.warning("could not fetch thumbnail %s: %s", url, exc)
        return None
    ext = _IMAGE_EXTENSIONS.get(content_type.lower()) or _extension_from_url(url)
    if ext is None:
        log.warning("thumbnail %s has unsupported type %r", url, content_type)
        return None
    filename = f"{COVER_BASENAME}.{ext}"
    tmp = directory / f"{COVER_BASENAME}.part"
    tmp.write_bytes(body)
    tmp.replace(directory / filename)
    # A retry may fetch artwork of a different type than the attempt before it.
    for stale in directory.glob(f"{COVER_BASENAME}.*"):
        if stale.name != filename:
            stale.unlink(missing_ok=True)
    return filename


def _extension_from_url(url: str) -> str | None:
    suffix = Path(url.split("?", 1)[0]).suffix.lower().lstrip(".")
    if suffix == "jpeg":
        suffix = "jpg"
    return suffix if suffix in _IMAGE_EXTENSIONS.values() else None

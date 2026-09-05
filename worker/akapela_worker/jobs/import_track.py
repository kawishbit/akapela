"""The import job: turn a Track's Source into its Backing Track.

The app creates the Track in `importing` and enqueues this job with the Track id
as target. For an Upload Source the original is already under the Track
directory as delivered. For a YouTube Source we first fetch metadata and write
it to the Track, so the card shows the title and thumbnail while the audio is
still downloading, then download the audio. Either way the original is then
normalized to the 44.1 kHz stereo WAV Backing Track, the duration recorded, and
the Track marked `ready`. Any failure marks the Track `failed` and re-raises so
the runner records the message on the job row. Nothing retries on its own.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from ..audio import normalize_to_backing_track, probe_duration_ms
from ..db import now_ms
from ..sources import ORIGINAL_BASENAME, SourceFetcher

if TYPE_CHECKING:
    import sqlite3

    from ..runner import Handler, JobContext

BACKING_TRACK_FILE = "backing.wav"

# Progress milestones. The YouTube download fills the gap between the first two.
PROGRESS_SOURCE_KNOWN = 10
PROGRESS_AUDIO_ON_DISK = 50
PROGRESS_NORMALIZED = 80


def track_dir(data_dir: Path, track_id: str) -> Path:
    return data_dir / "tracks" / track_id


def find_original(directory: Path) -> Path:
    """The original Source audio, kept as delivered with whatever extension it came with."""
    candidates = sorted(directory.glob(f"{ORIGINAL_BASENAME}.*")) if directory.is_dir() else []
    if not candidates:
        raise FileNotFoundError(f"no original audio in {directory}")
    return candidates[0]


def track_exists(conn: sqlite3.Connection, track_id: str) -> bool:
    return conn.execute("SELECT 1 FROM tracks WHERE id = ?", (track_id,)).fetchone() is not None


def mark_failed(conn: sqlite3.Connection, track_id: str) -> None:
    conn.execute(
        "UPDATE tracks SET import_state = 'failed', updated_at = ? WHERE id = ?",
        (now_ms(), track_id),
    )


def import_handler(fetcher: SourceFetcher) -> Handler:
    """The import job bound to the fetcher that will stand in for the network."""

    def run(ctx: JobContext) -> None:
        run_import(ctx, fetcher)

    return run


def run_import(ctx: JobContext, fetcher: SourceFetcher) -> None:
    track_id = ctx.job.target_id
    if not track_id:
        raise ValueError("import job has no target Track")
    row = ctx.conn.execute(
        "SELECT id, source_kind, source_ref FROM tracks WHERE id = ?", (track_id,)
    ).fetchone()
    if row is None:
        raise LookupError(f"Track {track_id} does not exist")

    directory = track_dir(ctx.data_dir, track_id)
    try:
        if row["source_kind"] == "youtube":
            original = _fetch_from_source(ctx, fetcher, track_id, row["source_ref"], directory)
        elif row["source_kind"] == "upload":
            original = find_original(directory)
            ctx.progress(PROGRESS_SOURCE_KNOWN)
        else:
            raise NotImplementedError(f"Source kind '{row['source_kind']}' is not importable")

        backing = directory / BACKING_TRACK_FILE
        normalize_to_backing_track(original, backing)
        ctx.progress(PROGRESS_NORMALIZED)

        duration_ms = probe_duration_ms(backing)
        _ensure_not_deleted(ctx.conn, track_id, directory)
        ctx.conn.execute(
            "UPDATE tracks SET duration_ms = ?, import_state = 'ready', updated_at = ?"
            " WHERE id = ?",
            (duration_ms, now_ms(), track_id),
        )
    except Exception:
        _ensure_not_deleted(ctx.conn, track_id, directory)
        mark_failed(ctx.conn, track_id)
        raise


def _fetch_from_source(
    ctx: JobContext, fetcher: SourceFetcher, track_id: str, url: str, directory: Path
) -> Path:
    """Metadata onto the Track first, then the audio, with download progress on the job."""
    metadata = fetcher.fetch_metadata(url, directory)
    _ensure_not_deleted(ctx.conn, track_id, directory)
    ctx.conn.execute(
        "UPDATE tracks SET title = ?, duration_ms = ?, cover_path = coalesce(?, cover_path),"
        " updated_at = ? WHERE id = ?",
        (metadata.title, metadata.duration_ms, metadata.cover_file, now_ms(), track_id),
    )
    ctx.progress(PROGRESS_SOURCE_KNOWN)

    last_reported = PROGRESS_SOURCE_KNOWN

    def on_progress(fraction: float) -> None:
        nonlocal last_reported
        span = PROGRESS_AUDIO_ON_DISK - PROGRESS_SOURCE_KNOWN
        percent = PROGRESS_SOURCE_KNOWN + int(span * max(0.0, min(1.0, fraction)))
        # yt-dlp reports many times a second; only touch the row when the number moves.
        if percent != last_reported:
            last_reported = percent
            ctx.progress(percent)

    original = fetcher.download_audio(url, directory, on_progress)
    _ensure_not_deleted(ctx.conn, track_id, directory)
    ctx.progress(PROGRESS_AUDIO_ON_DISK)
    return original


def _ensure_not_deleted(conn: sqlite3.Connection, track_id: str, directory: Path) -> None:
    """The singer may delete a Track while its import runs.

    The app removes the rows and the directory; anything written afterwards is an
    orphan, so remove it and give up rather than resurrect the Track.
    """
    if track_exists(conn, track_id):
        return
    shutil.rmtree(directory, ignore_errors=True)
    raise LookupError(f"Track {track_id} was deleted during import")

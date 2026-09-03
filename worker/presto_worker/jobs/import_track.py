"""The import job: turn a Track's original Source audio into its Backing Track.

The app creates the Track in `importing`, stores the original as delivered under
the Track directory, and enqueues this job with the Track id as target. We
normalize the original to the 44.1 kHz stereo WAV Backing Track, record the
duration, and mark the Track `ready`. Any failure marks the Track `failed` and
re-raises so the runner records the message on the job row.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from ..audio import normalize_to_backing_track, probe_duration_ms
from ..db import now_ms

if TYPE_CHECKING:
    import sqlite3

    from ..runner import JobContext

BACKING_TRACK_FILE = "backing.wav"
ORIGINAL_BASENAME = "original"


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


def run_import(ctx: JobContext) -> None:
    track_id = ctx.job.target_id
    if not track_id:
        raise ValueError("import job has no target Track")
    row = ctx.conn.execute(
        "SELECT id, source_kind FROM tracks WHERE id = ?", (track_id,)
    ).fetchone()
    if row is None:
        raise LookupError(f"Track {track_id} does not exist")

    directory = track_dir(ctx.data_dir, track_id)
    try:
        if row["source_kind"] != "upload":
            raise NotImplementedError(f"Source kind '{row['source_kind']}' is not importable yet")
        original = find_original(directory)
        ctx.progress(10)

        backing = directory / BACKING_TRACK_FILE
        normalize_to_backing_track(original, backing)
        ctx.progress(80)

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


def _ensure_not_deleted(conn: sqlite3.Connection, track_id: str, directory: Path) -> None:
    """The singer may delete a Track while its import runs.

    The app removes the rows and the directory; anything ffmpeg wrote afterwards
    is an orphan, so remove it and give up rather than resurrect the Track.
    """
    if track_exists(conn, track_id):
        return
    shutil.rmtree(directory, ignore_errors=True)
    raise LookupError(f"Track {track_id} was deleted during import")

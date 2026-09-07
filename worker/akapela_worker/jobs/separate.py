"""The separate job: turn a Track's Backing Track into its Stems.

The app enqueues this job with the Track id as target. The model is fetched on
first use into `<dataDir>/models/`, never at startup and never into the image
(ADR 0008), so the first separation on a machine pays for the download and none
after it does. The model then runs over `backing.wav` into a scratch directory,
and each output is normalized into the Track directory as `instrumental.wav`
and `vocals.wav` — 44.1 kHz stereo WAV like every other stored master
(ADR 0005), whatever the model chose to emit. `backing.wav` is never written,
so switching back to the original audio stays instant and lossless.

A run that succeeds also puts the Track's `backing_source` on the Instrumental
Stem it just wrote, since singing over it is what asking for it was for and
making the singer tap again would be asking twice. A run that fails leaves the
source alone, so a Track that never got Stems is never left naming a file
nothing wrote.

Going via the scratch directory is what makes re-separation bearable: the model
run is the long, failure-prone part, and a Track that already has Stems keeps
them until that run has produced replacements. Either way the Track's
`separation_state` moves to `ready` or `failed` the way the import job moves
`import_state`: the job row carries the mechanics, the Track carries what a card
renders. Any failure re-raises so the runner records the message on the job row.
Nothing retries on its own.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from ..audio import normalize_to_backing_track
from ..db import now_ms
from ..separators import INSTRUMENTAL_STEM_FILE, VOCALS_STEM_FILE, Separator
from .import_track import BACKING_TRACK_FILE, ensure_not_deleted, track_dir, track_exists

if TYPE_CHECKING:
    import sqlite3

    from ..runner import Handler, JobContext

MODELS_DIRNAME = "models"
"""Where model weights are cached, on the data volume so `docker compose pull` keeps them."""

SEPARATION_DIRNAME = "stems.part"
"""Scratch inside the Track directory: same filesystem, and swept up with the Track."""

# Progress milestones. Deliberately coarse — the model reports nothing usable in
# between, which is why the UI renders separation as an elapsed timer rather
# than a bar. The runner writes the final 100.
PROGRESS_STARTED = 10
PROGRESS_MODEL_READY = 30
PROGRESS_STEMS_WRITTEN = 85


def models_dir(data_dir: Path) -> Path:
    return data_dir / MODELS_DIRNAME


def separate_handler(separator: Separator) -> Handler:
    """The separate job bound to the separator that will stand in for the model."""

    def run(ctx: JobContext) -> None:
        run_separate(ctx, separator)

    return run


def run_separate(ctx: JobContext, separator: Separator) -> None:
    track_id = ctx.job.target_id
    if not track_id:
        raise ValueError("separate job has no target Track")
    if not track_exists(ctx.conn, track_id):
        raise LookupError(f"Track {track_id} does not exist")

    directory = track_dir(ctx.data_dir, track_id)
    # Everything from here on is inside the guard, so every failure a Track can
    # still be reached after leaves it `failed` rather than stuck `separating`:
    # the panel hides the retry button while a Track separates, so a Track
    # stranded there is unrecoverable without touching the database.
    try:
        backing = directory / BACKING_TRACK_FILE
        if not backing.is_file():
            raise FileNotFoundError(f"Track {track_id} has no Backing Track to separate")
        ctx.progress(PROGRESS_STARTED)

        models = models_dir(ctx.data_dir)
        separator.fetch_model(models)
        ctx.progress(PROGRESS_MODEL_READY)

        scratch = directory / SEPARATION_DIRNAME
        shutil.rmtree(scratch, ignore_errors=True)
        try:
            stems = separator.separate(backing, scratch, models)
            ensure_not_deleted(ctx.conn, track_id, directory, during="separation")
            normalize_to_backing_track(stems.instrumental, directory / INSTRUMENTAL_STEM_FILE)
            normalize_to_backing_track(stems.vocals, directory / VOCALS_STEM_FILE)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)
        ctx.progress(PROGRESS_STEMS_WRITTEN)

        ensure_not_deleted(ctx.conn, track_id, directory, during="separation")
        _mark_separated(ctx.conn, track_id)
    except Exception:
        # The job row carries the message; the Track carries the state a card
        # renders, and it is `failed` that puts the error and its retry button
        # on the Track. A Track deleted mid-run has no state to move, so the
        # guard runs first and gives up rather than resurrecting the row.
        ensure_not_deleted(ctx.conn, track_id, directory, during="separation")
        _mark_separation_failed(ctx.conn, track_id)
        raise


def _mark_separated(conn: sqlite3.Connection, track_id: str) -> None:
    """The Track has Stems, and now sings over them."""
    conn.execute(
        "UPDATE tracks SET separation_state = 'ready', backing_source = 'instrumental',"
        " updated_at = ? WHERE id = ?",
        (now_ms(), track_id),
    )


def _mark_separation_failed(conn: sqlite3.Connection, track_id: str) -> None:
    """The Track keeps whatever it was singing over, which is the only thing it still has."""
    conn.execute(
        "UPDATE tracks SET separation_state = 'failed', updated_at = ? WHERE id = ?",
        (now_ms(), track_id),
    )

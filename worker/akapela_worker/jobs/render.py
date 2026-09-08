"""The render job: turn a Take into a Mix.

The app inserts the Mix row with every render parameter already fixed —
pitch, the Take's own locked tempo, nudge, and gains — and enqueues this job
with the Mix id as target. Placing the vocal is two conversions from the same
`timeRatio` the browser's Review screen uses (ADR 0003): the Backing Track's
own duration scales by it to get the Mix's total length, and the Take's song-time
start position (plus nudge) scales by it to get the vocal's wall-clock
placement, so a Mix rendered here sounds like what review played. Any failure
re-raises so the runner records the message on the job row; nothing retries on
its own.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from ..audio import probe_duration_ms, render_mix
from ..db import now_ms
from ..separators import INSTRUMENTAL_STEM_FILE

if TYPE_CHECKING:
    import sqlite3

    from ..runner import JobContext

BACKING_TRACK_FILE = "backing.wav"
MIXES_DIRNAME = "mixes"

# Mirrors `BACKING_SOURCE_FILES` in `server/lib/tracks.ts`.
BACKING_SOURCE_FILES = {"original": BACKING_TRACK_FILE, "instrumental": INSTRUMENTAL_STEM_FILE}

PROGRESS_STARTED = 10
PROGRESS_RENDERED = 80


def track_dir(data_dir: Path, track_id: str) -> Path:
    return data_dir / "tracks" / track_id


def mix_exists(conn: sqlite3.Connection, mix_id: str) -> bool:
    return conn.execute("SELECT 1 FROM mixes WHERE id = ?", (mix_id,)).fetchone() is not None


def run_render(ctx: JobContext) -> None:
    mix_id = ctx.job.target_id
    if not mix_id:
        raise ValueError("render job has no target Mix")
    row = ctx.conn.execute(
        "SELECT m.id, m.pitch_semitones, m.tempo_percent, m.linked, m.reverb_amount, m.lowpass_hz,"
        " m.effects_target,"
        " m.backing_source, m.latency_nudge_ms, m.vocal_gain, m.backing_gain, m.wav_requested,"
        " t.track_id, t.start_position_ms, t.file_path AS take_file_path"
        " FROM mixes m JOIN takes t ON t.id = m.take_id"
        " WHERE m.id = ?",
        (mix_id,),
    ).fetchone()
    if row is None:
        raise LookupError(f"Mix {mix_id} does not exist")

    ctx.progress(PROGRESS_STARTED)

    directory = track_dir(ctx.data_dir, row["track_id"])
    # A Mix reproduces its own Backing Source regardless of what the Track has
    # been switched to since (ADR 0003 amendment). Stems can be deleted after a
    # Mix named them, so a missing file fails loudly here rather than silently
    # falling back to the original.
    backing_source = row["backing_source"]
    backing = directory / BACKING_SOURCE_FILES[backing_source]
    if not backing.is_file():
        raise FileNotFoundError(
            f"This Mix was requested against its {backing_source} Backing Source, "
            "which is no longer on disk."
        )
    vocal = directory / row["take_file_path"]
    mixes_dir = directory / MIXES_DIRNAME
    mp3_path = mixes_dir / f"{mix_id}.mp3"
    wav_requested = bool(row["wav_requested"])
    wav_path = mixes_dir / f"{mix_id}.wav" if wav_requested else None

    tempo_percent = row["tempo_percent"]
    time_ratio = 100 / tempo_percent
    pitch_scale = tempo_percent / 100 if row["linked"] else 2 ** (row["pitch_semitones"] / 12)

    original_duration_ms = probe_duration_ms(backing)
    target_duration_ms = round(original_duration_ms * time_ratio)
    target_song_ms = row["start_position_ms"] + row["latency_nudge_ms"]
    vocal_wall_ms = target_song_ms * time_ratio

    render_mix(
        backing=backing,
        vocal=vocal,
        dst_mp3=mp3_path,
        dst_wav=wav_path,
        tempo=tempo_percent / 100,
        pitch=pitch_scale,
        vocal_wall_ms=vocal_wall_ms,
        vocal_gain=row["vocal_gain"],
        backing_gain=row["backing_gain"],
        target_duration_ms=target_duration_ms,
        reverb_amount=row["reverb_amount"],
        lowpass_hz=row["lowpass_hz"],
        effects_target=row["effects_target"],
    )
    ctx.progress(PROGRESS_RENDERED)

    # The singer may delete the Mix while its render runs. The row (and the
    # app's own copies of its files, deleteMix in server/lib/mixes.ts) are
    # already gone by then, so what was just written here is an orphan —
    # clean it up rather than resurrect the Mix (mirrors _ensure_not_deleted
    # in jobs/import_track.py).
    if not mix_exists(ctx.conn, mix_id):
        mp3_path.unlink(missing_ok=True)
        if wav_path is not None:
            wav_path.unlink(missing_ok=True)
        raise LookupError(f"Mix {mix_id} was deleted during render")

    ctx.conn.execute(
        "UPDATE mixes SET mp3_path = ?, wav_path = ?, updated_at = ? WHERE id = ?",
        (
            f"{MIXES_DIRNAME}/{mix_id}.mp3",
            f"{MIXES_DIRNAME}/{mix_id}.wav" if wav_requested else None,
            now_ms(),
            mix_id,
        ),
    )

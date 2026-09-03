"""The import job: original Source audio in, normalized Backing Track WAV out."""

from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
from pathlib import Path

import pytest

from presto_worker.runner import JobContext, Runner

from .conftest import get_job

TRACK_ID = "t1"


def insert_track(conn: sqlite3.Connection, *, source_ref: str) -> None:
    """Insert a Track the way the app does on upload: importing, no duration yet."""
    conn.execute(
        "INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind,"
        " source_ref, import_state, created_at, updated_at)"
        " VALUES (?, 'Sine', NULL, NULL, 'cover.svg', 'upload', ?, 'importing', 1000, 1000)",
        (TRACK_ID, source_ref),
    )
    conn.commit()


def enqueue_import(conn: sqlite3.Connection, *, job_id: str = "j1") -> None:
    conn.execute(
        "INSERT INTO jobs (id, type, target_id, state, progress, error, created_at)"
        " VALUES (?, 'import', ?, 'queued', 0, NULL, 1000)",
        (job_id, TRACK_ID),
    )
    conn.commit()


def get_track(conn: sqlite3.Connection) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM tracks WHERE id = ?", (TRACK_ID,)).fetchone()
    assert row is not None
    return row


def write_sine_mp3(path: Path, seconds: float) -> None:
    """A short mono 22.05 kHz mp3, so normalization has real work to do."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={seconds}",
            "-ar",
            "22050",
            "-ac",
            "1",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(path),
        ],
        check=True,
    )


def probe(path: Path) -> dict:
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=sample_rate,channels,codec_name",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(out)


def test_import_produces_a_backing_track_wav_and_marks_the_track_ready(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_mp3(track_dir / "original.mp3", seconds=2.0)
    insert_track(conn, source_ref="sine.mp3")
    enqueue_import(conn)

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    backing = track_dir / "backing.wav"
    assert backing.exists()
    info = probe(backing)
    stream = info["streams"][0]
    assert stream["codec_name"] == "pcm_s16le"
    assert stream["sample_rate"] == "44100"
    assert stream["channels"] == 2
    assert abs(float(info["format"]["duration"]) - 2.0) < 0.15

    track = get_track(conn)
    assert track["import_state"] == "ready"
    assert abs(track["duration_ms"] - 2000) < 150
    assert track["updated_at"] > 1000
    # The original is kept as delivered.
    assert (track_dir / "original.mp3").exists()


def test_a_corrupt_original_records_the_error_on_the_job_and_fails_the_track(conn, data_dir):
    track_dir = data_dir / "tracks" / TRACK_ID
    track_dir.mkdir(parents=True)
    # Text bytes carry no mp3 frame sync words, so ffmpeg deterministically refuses them.
    (track_dir / "original.mp3").write_bytes(b"this is not audio at all, " * 200)
    insert_track(conn, source_ref="broken.mp3")
    enqueue_import(conn)

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "ffmpeg" in job["error"].lower()
    assert get_track(conn)["import_state"] == "failed"
    assert not (track_dir / "backing.wav").exists()


def test_import_of_a_missing_track_fails_the_job(conn, data_dir):
    enqueue_import(conn)

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert TRACK_ID in job["error"]


@pytest.mark.parametrize("delete_at", [10, 80], ids=["before-ffmpeg", "after-ffmpeg"])
def test_a_track_deleted_during_import_leaves_no_orphan_directory(
    conn, data_dir: Path, monkeypatch: pytest.MonkeyPatch, delete_at: int
):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_mp3(track_dir / "original.mp3", seconds=1.0)
    insert_track(conn, source_ref="sine.mp3")
    enqueue_import(conn)

    original_progress = JobContext.progress

    def progress_then_delete(self: JobContext, percent: int) -> None:
        original_progress(self, percent)
        if percent == delete_at:
            # Stand in for the app: the singer deleted the Track while the job ran.
            conn.execute("DELETE FROM tracks WHERE id = ?", (TRACK_ID,))
            shutil.rmtree(track_dir, ignore_errors=True)

    monkeypatch.setattr(JobContext, "progress", progress_then_delete)

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "deleted" in job["error"]
    assert not track_dir.exists()

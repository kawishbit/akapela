"""The separate job: a Track's Backing Track in, its two Stems out."""

from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest

from akapela_worker.jobs import DEFAULT_HANDLERS
from akapela_worker.jobs.separate import separate_handler
from akapela_worker.runner import JobContext, Runner
from akapela_worker.separators import (
    MODEL_FILENAME,
    MdxNetSeparator,
    SeparationError,
    Stems,
)

from .conftest import get_job

TRACK_ID = "t1"
BACKING_SECONDS = 2.0


def write_sine_wav(
    path: Path,
    *,
    frequency: float = 440,
    seconds: float = BACKING_SECONDS,
    sample_rate: int = 44100,
    channels: int = 2,
) -> None:
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
            f"sine=frequency={frequency}:duration={seconds}",
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            "-c:a",
            "pcm_s16le",
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


def duration_seconds(path: Path) -> float:
    return float(probe(path)["format"]["duration"])


class FakeSeparator:
    """Stands in for the model: writes fixture Stems without going near a network.

    Deliberately writes mono 22.05 kHz files. The real model emits 44.1 kHz
    stereo already, but what holds every stored master to 44.1 kHz stereo
    (ADR 0005) is the job rather than the model, and a fake that already
    conformed could not show that. Their length is taken from the Backing Track
    it is handed, so a job that truncated or padded a Stem would be caught.
    """

    def __init__(
        self,
        *,
        fetch_error: str | None = None,
        separate_error: str | None = None,
        during_separation: Callable[[], None] | None = None,
    ):
        self.fetch_error = fetch_error
        self.separate_error = separate_error
        self.during_separation = during_separation
        self.models_dirs: list[Path] = []
        self.separated: list[Path] = []

    def fetch_model(self, models_dir: Path) -> None:
        if self.fetch_error:
            raise SeparationError(self.fetch_error)
        self.models_dirs.append(models_dir)
        model = models_dir / "fake-model.onnx"
        if model.exists():
            return
        models_dir.mkdir(parents=True, exist_ok=True)
        model.write_bytes(b"not a model")

    def separate(self, backing: Path, directory: Path, models_dir: Path) -> Stems:
        if self.separate_error:
            raise SeparationError(self.separate_error)
        self.separated.append(backing)
        seconds = duration_seconds(backing)
        directory.mkdir(parents=True, exist_ok=True)
        stems = Stems(instrumental=directory / "instrumental.wav", vocals=directory / "vocals.wav")
        write_sine_wav(
            stems.instrumental, frequency=220, seconds=seconds, sample_rate=22050, channels=1
        )
        write_sine_wav(stems.vocals, frequency=880, seconds=seconds, sample_rate=22050, channels=1)
        # The model run is the minutes-long window a Track can be deleted in.
        if self.during_separation:
            self.during_separation()
        return stems


def insert_track(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind,"
        " source_ref, import_state, created_at, updated_at)"
        " VALUES (?, 'Sine Song', NULL, 2000, 'cover.svg', 'upload', 'sine.wav',"
        " 'ready', 1000, 1000)",
        (TRACK_ID,),
    )
    conn.commit()


def enqueue_separate(conn: sqlite3.Connection, *, job_id: str = "j1") -> None:
    conn.execute(
        "INSERT INTO jobs (id, type, target_id, state, progress, error, created_at)"
        " VALUES (?, 'separate', ?, 'queued', 0, NULL, 1000)",
        (job_id, TRACK_ID),
    )
    conn.commit()


def run_the_job(conn, data_dir: Path, separator: FakeSeparator) -> None:
    Runner(conn, data_dir, handlers={"separate": separate_handler(separator)}).run_once()


@pytest.fixture
def track_dir(data_dir: Path) -> Path:
    directory = data_dir / "tracks" / TRACK_ID
    write_sine_wav(directory / "backing.wav")
    return directory


def test_the_worker_answers_separate_jobs_out_of_the_box():
    """Every other test injects a fake, so nothing else would notice this going missing."""
    assert "separate" in DEFAULT_HANDLERS


def test_separation_writes_both_stems_beside_an_untouched_backing_track(
    conn, data_dir: Path, track_dir: Path
):
    insert_track(conn)
    enqueue_separate(conn)
    backing = track_dir / "backing.wav"
    backing_before = backing.read_bytes()

    run_the_job(conn, data_dir, FakeSeparator())

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    for name in ("instrumental.wav", "vocals.wav"):
        stem = track_dir / name
        assert stem.exists(), f"{name} was not written"
        stream = probe(stem)["streams"][0]
        assert stream["codec_name"] == "pcm_s16le"
        assert stream["sample_rate"] == "44100"
        assert stream["channels"] == 2
        assert abs(duration_seconds(stem) - duration_seconds(backing)) < 0.15

    # Switching back to the original audio is only instant and lossless while
    # the Backing Track survives separation untouched.
    assert backing.read_bytes() == backing_before


def test_the_model_is_fetched_into_the_data_directory_and_reused_next_time(
    conn, data_dir: Path, track_dir: Path
):
    insert_track(conn)
    separator = FakeSeparator()

    enqueue_separate(conn, job_id="j1")
    run_the_job(conn, data_dir, separator)
    model = data_dir / "models" / "fake-model.onnx"
    assert model.exists()
    fetched_at = model.stat().st_mtime_ns

    enqueue_separate(conn, job_id="j2")
    run_the_job(conn, data_dir, separator)

    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]
    # The same cache both times, on the data volume rather than per-Job scratch,
    # and the second run did not fetch it again.
    assert separator.models_dirs == [data_dir / "models", data_dir / "models"]
    assert model.stat().st_mtime_ns == fetched_at


def test_separation_reports_its_coarse_steps_on_the_job_row(
    conn, data_dir: Path, track_dir: Path, monkeypatch: pytest.MonkeyPatch
):
    insert_track(conn)
    enqueue_separate(conn)
    reported: list[int] = []
    original = JobContext.progress

    def record(self: JobContext, percent: int) -> None:
        reported.append(percent)
        original(self, percent)

    monkeypatch.setattr(JobContext, "progress", record)

    run_the_job(conn, data_dir, FakeSeparator())

    assert reported == [10, 30, 85]
    # The runner owns the last step.
    assert get_job(conn, "j1")["progress"] == 100


def test_re_separating_a_track_overwrites_both_stems_in_place(
    conn, data_dir: Path, track_dir: Path
):
    insert_track(conn)
    (track_dir / "instrumental.wav").write_bytes(b"stale stem from an older model")
    (track_dir / "vocals.wav").write_bytes(b"stale stem from an older model")
    enqueue_separate(conn)

    run_the_job(conn, data_dir, FakeSeparator())

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    for name in ("instrumental.wav", "vocals.wav"):
        assert probe(track_dir / name)["streams"][0]["sample_rate"] == "44100"
    # Nothing of the run that replaced them is left behind.
    assert sorted(p.name for p in track_dir.glob("*.wav")) == [
        "backing.wav",
        "instrumental.wav",
        "vocals.wav",
    ]
    assert not (track_dir / "stems.part").exists()


def test_a_failed_model_download_records_why_on_the_job_and_writes_no_stems(
    conn, data_dir: Path, track_dir: Path
):
    insert_track(conn)
    enqueue_separate(conn)
    message = f"could not download the separation model {MODEL_FILENAME}: no network"

    run_the_job(conn, data_dir, FakeSeparator(fetch_error=message))

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert message in job["error"]
    assert not (track_dir / "instrumental.wav").exists()
    assert not (track_dir / "vocals.wav").exists()


def test_the_real_download_failure_names_the_model_and_the_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """The message above is the fake's. This is the one a singer would actually read.

    The model itself never runs — only the wrapper around its download does.
    """

    class RefusingBackend:
        def download_model_and_data(self, model_filename: str) -> None:
            raise OSError("Temporary failure in name resolution")

    separator = MdxNetSeparator()
    monkeypatch.setattr(MdxNetSeparator, "_backend", lambda self, *a, **k: RefusingBackend())

    with pytest.raises(SeparationError) as failure:
        separator.fetch_model(tmp_path / "models")

    message = str(failure.value)
    assert MODEL_FILENAME in message
    assert "network" in message
    assert "Temporary failure in name resolution" in message


def test_a_failed_separation_records_the_error_and_leaves_earlier_stems_alone(
    conn, data_dir: Path, track_dir: Path
):
    insert_track(conn)
    write_sine_wav(track_dir / "instrumental.wav", frequency=110)
    kept = (track_dir / "instrumental.wav").read_bytes()
    enqueue_separate(conn)

    run_the_job(conn, data_dir, FakeSeparator(separate_error="the model refused this audio"))

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "the model refused this audio" in job["error"]
    assert (track_dir / "instrumental.wav").read_bytes() == kept


def test_separating_a_missing_track_fails_the_job(conn, data_dir: Path):
    enqueue_separate(conn)

    run_the_job(conn, data_dir, FakeSeparator())

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert TRACK_ID in job["error"]


def test_a_track_deleted_while_the_model_runs_leaves_no_orphan_directory(
    conn, data_dir: Path, track_dir: Path
):
    insert_track(conn)
    enqueue_separate(conn)

    def delete_the_track() -> None:
        # Stand in for the app: the singer deleted the Track during the minutes
        # the model was running.
        conn.execute("DELETE FROM tracks WHERE id = ?", (TRACK_ID,))
        shutil.rmtree(track_dir, ignore_errors=True)

    run_the_job(conn, data_dir, FakeSeparator(during_separation=delete_the_track))

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "deleted during separation" in job["error"]
    assert not track_dir.exists()

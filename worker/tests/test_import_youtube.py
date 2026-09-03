"""The import job for a YouTube Source: metadata first, then audio, then the Backing Track."""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from presto_worker.jobs.import_track import import_handler
from presto_worker.runner import Runner
from presto_worker.sources import SourceError, SourceMetadata

from .conftest import get_job
from .test_import import TRACK_ID, enqueue_import, get_track, probe, write_sine_mp3

URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
COVER_BYTES = b"\xff\xd8\xff\xe0 not really a jpeg"


def insert_youtube_track(conn: sqlite3.Connection) -> None:
    """Insert a Track the way the app does from a URL: a stand-in title, placeholder cover."""
    conn.execute(
        "INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind,"
        " source_ref, import_state, created_at, updated_at)"
        " VALUES (?, 'youtu.be/dQw4w9WgXcQ', NULL, NULL, 'cover.svg', 'youtube', ?,"
        " 'importing', 1000, 1000)",
        (TRACK_ID, URL),
    )
    conn.commit()


@dataclass
class FakeFetcher:
    """Stands in for yt-dlp: canned metadata, and a sine fixture instead of a download.

    `on_download` runs before the fixture is copied so a test can observe what the
    Track row looks like while the download is still in flight.
    """

    metadata: SourceMetadata | None = None
    metadata_error: str | None = None
    download_error: str | None = None
    on_download: Callable[[], None] | None = None

    def fetch_metadata(self, url: str, directory: Path) -> SourceMetadata:
        if self.metadata_error:
            raise SourceError(self.metadata_error)
        assert self.metadata is not None
        if self.metadata.cover_file:
            directory.mkdir(parents=True, exist_ok=True)
            (directory / self.metadata.cover_file).write_bytes(COVER_BYTES)
        return self.metadata

    def download_audio(
        self, url: str, directory: Path, on_progress: Callable[[float], None]
    ) -> Path:
        if self.on_download:
            self.on_download()
        if self.download_error:
            raise SourceError(self.download_error)
        on_progress(0.5)
        on_progress(1.0)
        original = directory / "original.mp3"
        write_sine_mp3(original, seconds=2.0)
        return original


CANNED = SourceMetadata(
    title="Rick Astley - Never Gonna Give You Up",
    duration_ms=213_000,
    cover_file="cover.jpg",
)


def run_import_with(conn: sqlite3.Connection, data_dir: Path, fetcher: FakeFetcher) -> None:
    Runner(conn, data_dir, handlers={"import": import_handler(fetcher)}).run_once()


def test_a_youtube_import_downloads_the_audio_and_produces_a_backing_track(conn, data_dir: Path):
    insert_youtube_track(conn)
    enqueue_import(conn)
    fetcher = FakeFetcher(metadata=CANNED)

    run_import_with(conn, data_dir, fetcher)

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]

    track_dir = data_dir / "tracks" / TRACK_ID
    # The download is kept as delivered, next to the normalized Backing Track.
    assert (track_dir / "original.mp3").exists()
    backing = track_dir / "backing.wav"
    assert backing.exists()
    stream = probe(backing)["streams"][0]
    assert (stream["codec_name"], stream["sample_rate"], stream["channels"]) == (
        "pcm_s16le",
        "44100",
        2,
    )

    track = get_track(conn)
    assert track["import_state"] == "ready"
    assert track["title"] == "Rick Astley - Never Gonna Give You Up"
    assert track["cover_path"] == "cover.jpg"
    assert (track_dir / "cover.jpg").read_bytes() == COVER_BYTES
    # The duration comes from the audio that was actually downloaded, not the listing.
    assert abs(track["duration_ms"] - 2000) < 150


def test_metadata_reaches_the_track_before_the_download_starts(conn, data_dir: Path):
    insert_youtube_track(conn)
    enqueue_import(conn)
    seen: dict[str, object] = {}

    def snapshot() -> None:
        track = get_track(conn)
        seen.update(track=dict(track), job_progress=get_job(conn, "j1")["progress"])

    run_import_with(conn, data_dir, FakeFetcher(metadata=CANNED, on_download=snapshot))

    assert seen["track"]["title"] == "Rick Astley - Never Gonna Give You Up"  # type: ignore[index]
    assert seen["track"]["cover_path"] == "cover.jpg"  # type: ignore[index]
    assert seen["track"]["duration_ms"] == 213_000  # type: ignore[index]
    assert seen["track"]["import_state"] == "importing"  # type: ignore[index]
    assert seen["track"]["updated_at"] > 1000  # type: ignore[index]
    assert seen["job_progress"] > 0


def test_a_video_without_a_thumbnail_keeps_the_placeholder_cover(conn, data_dir: Path):
    insert_youtube_track(conn)
    enqueue_import(conn)
    no_cover = SourceMetadata(title="Live set", duration_ms=None, cover_file=None)

    run_import_with(conn, data_dir, FakeFetcher(metadata=no_cover))

    track = get_track(conn)
    assert track["import_state"] == "ready"
    assert track["title"] == "Live set"
    assert track["cover_path"] == "cover.svg"


def test_a_failed_metadata_fetch_records_the_error_and_fails_the_track(conn, data_dir: Path):
    insert_youtube_track(conn)
    enqueue_import(conn)
    fetcher = FakeFetcher(metadata_error="[youtube] dQw4w9WgXcQ: Video unavailable")

    run_import_with(conn, data_dir, fetcher)

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert job["error"].startswith("SourceError: [youtube] dQw4w9WgXcQ: Video unavailable")
    track = get_track(conn)
    assert track["import_state"] == "failed"
    assert track["title"] == "youtu.be/dQw4w9WgXcQ"
    # The download never started, and nothing retries on its own; the singer does, from the card.
    assert not list((data_dir / "tracks" / TRACK_ID).glob("*"))


def test_a_failed_download_keeps_the_early_metadata_and_fails_the_track(conn, data_dir: Path):
    insert_youtube_track(conn)
    enqueue_import(conn)
    fetcher = FakeFetcher(metadata=CANNED, download_error="HTTP Error 403: Forbidden")

    run_import_with(conn, data_dir, fetcher)

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "403" in job["error"]
    track = get_track(conn)
    assert track["import_state"] == "failed"
    assert track["title"] == "Rick Astley - Never Gonna Give You Up"
    assert track["cover_path"] == "cover.jpg"
    assert not (data_dir / "tracks" / TRACK_ID / "backing.wav").exists()


def test_a_retry_runs_the_whole_import_again(conn, data_dir: Path):
    insert_youtube_track(conn)
    enqueue_import(conn, job_id="j1")
    run_import_with(conn, data_dir, FakeFetcher(metadata_error="network down"))
    assert get_track(conn)["import_state"] == "failed"

    # Stand in for the app's retry endpoint.
    conn.execute("UPDATE tracks SET import_state = 'importing' WHERE id = ?", (TRACK_ID,))
    enqueue_import(conn, job_id="j2")
    fetcher = FakeFetcher(metadata=CANNED)
    run_import_with(conn, data_dir, fetcher)

    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]
    assert get_track(conn)["import_state"] == "ready"
    assert (data_dir / "tracks" / TRACK_ID / "backing.wav").exists()

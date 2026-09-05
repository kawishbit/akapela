from __future__ import annotations

from pathlib import Path

from akapela_worker.runner import Runner

from .conftest import enqueue, get_job


def failing_handler(ctx):
    raise RuntimeError("yt-dlp exploded")


def test_queued_noop_job_is_run_to_succeeded(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    runner = Runner(conn, data_dir)

    assert runner.run_once() is True

    job = get_job(conn, "j1")
    assert job["state"] == "succeeded"
    assert job["progress"] == 100
    assert job["error"] is None
    assert job["started_at"] is not None
    assert job["finished_at"] is not None


def test_run_once_reports_nothing_to_do_on_empty_queue(conn, data_dir: Path):
    runner = Runner(conn, data_dir)
    assert runner.run_once() is False


def test_handler_failure_is_recorded_on_the_job(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    runner = Runner(conn, data_dir, handlers={"noop": failing_handler})

    runner.run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "yt-dlp exploded" in job["error"]
    assert job["finished_at"] is not None


def test_unknown_job_type_fails_rather_than_hanging(conn, data_dir: Path):
    enqueue(conn, "teleport", job_id="j1", created_at=1000)
    runner = Runner(conn, data_dir)

    runner.run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "teleport" in job["error"]


def test_jobs_run_one_at_a_time_in_creation_order(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="second", created_at=2000)
    enqueue(conn, "noop", job_id="first", created_at=1000)
    runner = Runner(conn, data_dir)

    runner.run_once()
    assert get_job(conn, "first")["state"] == "succeeded"
    assert get_job(conn, "second")["state"] == "queued"

    runner.run_once()
    assert get_job(conn, "second")["state"] == "succeeded"


def test_stale_running_jobs_are_requeued_on_startup(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    conn.execute(
        "UPDATE jobs SET state = 'running', started_at = 1500, progress = 40 WHERE id = 'j1'"
    )
    conn.commit()

    Runner(conn, data_dir).recover_stale_jobs()

    job = get_job(conn, "j1")
    assert job["state"] == "queued"
    assert job["started_at"] is None
    assert job["progress"] == 0

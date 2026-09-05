from __future__ import annotations

import logging
from contextlib import contextmanager
from pathlib import Path

from akapela_worker.runner import Runner

from .conftest import enqueue, get_job


class RecordingTelemetry:
    """Stands in for the Dashboard: remembers every span the runner asked for."""

    enabled = True

    def __init__(self, conn):
        self.conn = conn
        self.spans = []

    @contextmanager
    def job_span(self, job, trace_parent):
        record = {
            "job": job,
            "trace_parent": trace_parent,
            "failed_with": None,
            "state_when_closed": None,
        }
        self.spans.append(record)

        class Span:
            def failed(self, exc):
                record["failed_with"] = exc

        yield Span()
        # What the job row says at the moment the span ends, which is how a test
        # sees whether the span really covered the job to its terminal state.
        record["state_when_closed"] = self.conn.execute(
            "SELECT state FROM jobs WHERE id = ?", (record["job"].id,)
        ).fetchone()["state"]

    def shutdown(self):
        pass


TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


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


def test_progress_is_logged_so_it_reaches_the_dashboard(conn, data_dir: Path, caplog):
    """The Dashboard pools our stdout; progress is only useful there if we say it."""
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    runner = Runner(conn, data_dir, handlers={"noop": lambda ctx: ctx.progress(42)})

    with caplog.at_level(logging.INFO, logger="akapela_worker.runner"):
        runner.run_once()

    assert any("j1" in record.message and "42%" in record.message for record in caplog.records)
    assert get_job(conn, "j1")["progress"] == 100


def test_a_job_is_run_inside_a_span_covering_its_lifetime(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, telemetry=telemetry).run_once()

    (span,) = telemetry.spans
    assert span["job"].id == "j1"
    assert span["job"].type == "noop"


def test_the_span_carries_the_trace_of_the_request_that_enqueued_the_job(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000, trace_parent=TRACEPARENT)
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, telemetry=telemetry).run_once()

    assert telemetry.spans[0]["trace_parent"] == TRACEPARENT


def test_a_job_enqueued_without_a_trace_still_gets_a_span(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, telemetry=telemetry).run_once()

    assert telemetry.spans[0]["trace_parent"] is None


def test_a_handler_failure_reaches_the_span_as_well_as_the_job_row(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, handlers={"noop": failing_handler}, telemetry=telemetry).run_once()

    assert isinstance(telemetry.spans[0]["failed_with"], RuntimeError)
    assert get_job(conn, "j1")["state"] == "failed"


def test_an_empty_queue_opens_no_span(conn, data_dir: Path):
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, telemetry=telemetry).run_once()

    assert telemetry.spans == []


def test_the_span_is_still_open_when_the_job_reaches_its_terminal_state(conn, data_dir: Path):
    """A span that closes before the row is written does not cover the Job's lifetime."""
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, telemetry=telemetry).run_once()

    assert telemetry.spans[0]["state_when_closed"] == "succeeded"


def test_a_failed_job_is_written_before_its_span_closes_too(conn, data_dir: Path):
    enqueue(conn, "noop", job_id="j1", created_at=1000)
    telemetry = RecordingTelemetry(conn)

    Runner(conn, data_dir, handlers={"noop": failing_handler}, telemetry=telemetry).run_once()

    assert telemetry.spans[0]["state_when_closed"] == "failed"

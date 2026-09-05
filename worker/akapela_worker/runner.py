"""Claims queued jobs one at a time and runs them to a terminal state."""

from __future__ import annotations

import logging
import sqlite3
import time
import traceback
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from .db import now_ms
from .jobs import DEFAULT_HANDLERS
from .telemetry import Telemetry, configure

log = logging.getLogger(__name__)


class JobState(StrEnum):
    """Mirrors JOB_STATES in the app's schema. The app inserts QUEUED; we own the rest."""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True)
class Job:
    id: str
    type: str
    target_id: str | None
    #: W3C ``traceparent`` of the request that enqueued this Job, when the app
    #: was tracing. What makes this Job's span join that request's trace rather
    #: than starting one nobody can connect to a click.
    trace_parent: str | None = None


@dataclass
class JobContext:
    """What a handler gets: the job, where files live, the database, and a progress hook."""

    job: Job
    data_dir: Path
    conn: sqlite3.Connection

    def progress(self, percent: int) -> None:
        """Put the percent on the job row, and say it so the Dashboard shows it too."""
        clamped = max(0, min(100, int(percent)))
        self.conn.execute(
            "UPDATE jobs SET progress = ? WHERE id = ?",
            (clamped, self.job.id),
        )
        log.info("job %s %d%%", self.job.id, clamped)


Handler = Callable[[JobContext], None]


class Runner:
    def __init__(
        self,
        conn: sqlite3.Connection,
        data_dir: Path,
        handlers: Mapping[str, Handler] | None = None,
        telemetry: Telemetry | None = None,
    ) -> None:
        self.conn = conn
        self.data_dir = Path(data_dir)
        self.handlers: Mapping[str, Handler] = handlers or DEFAULT_HANDLERS
        # Defaults to the do-nothing one, so a Runner built without telemetry —
        # which is every test but a handful, and every run outside the AppHost —
        # behaves exactly as it did before there was any.
        self.telemetry: Telemetry = telemetry or configure({})

    def recover_stale_jobs(self) -> int:
        """Requeue jobs left `running` by a previous worker process that died."""
        cursor = self.conn.execute(
            "UPDATE jobs SET state = ?, started_at = NULL, progress = 0 WHERE state = ?",
            (JobState.QUEUED, JobState.RUNNING),
        )
        if cursor.rowcount:
            log.warning("requeued %d stale running job(s)", cursor.rowcount)
        return cursor.rowcount

    def claim_next(self) -> Job | None:
        """Atomically move the oldest queued job to running and return it."""
        row = self.conn.execute(
            "UPDATE jobs SET state = ?, started_at = ?"
            " WHERE id = ("
            "   SELECT id FROM jobs WHERE state = ?"
            "   ORDER BY created_at, rowid LIMIT 1"
            " )"
            " RETURNING id, type, target_id, trace_parent",
            (JobState.RUNNING, now_ms(), JobState.QUEUED),
        ).fetchone()
        if row is None:
            return None
        return Job(
            id=row["id"],
            type=row["type"],
            target_id=row["target_id"],
            trace_parent=row["trace_parent"],
        )

    def run_once(self) -> bool:
        """Run at most one job. Returns False when the queue was empty."""
        job = self.claim_next()
        if job is None:
            return False
        log.info("job %s (%s) started", job.id, job.type)
        # The span wraps the terminal UPDATE as well as the handler, so what the
        # Dashboard shows is the Job's lifetime rather than the handler's. The
        # runner swallows a handler's failure — it belongs on the job row — so
        # the span has to be told about it explicitly.
        with self.telemetry.job_span(job, job.trace_parent) as span:
            try:
                handler = self.handlers.get(job.type)
                if handler is None:
                    raise LookupError(f"no handler for job type '{job.type}'")
                handler(JobContext(job, self.data_dir, self.conn))
            except Exception as exc:  # noqa: BLE001 - any failure must land on the job row
                log.exception("job %s failed", job.id)
                span.failed(exc)
                message = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
                self.conn.execute(
                    "UPDATE jobs SET state = ?, error = ?, finished_at = ? WHERE id = ?",
                    (JobState.FAILED, message, now_ms(), job.id),
                )
            else:
                self.conn.execute(
                    "UPDATE jobs SET state = ?, progress = 100, finished_at = ? WHERE id = ?",
                    (JobState.SUCCEEDED, now_ms(), job.id),
                )
                log.info("job %s succeeded", job.id)
        return True

    def run_forever(self, poll_interval: float = 1.0) -> None:
        self.recover_stale_jobs()
        while True:
            if not self.run_once():
                time.sleep(poll_interval)

"""Shared fixtures: a temp data directory with the app's real schema applied."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from akapela_worker.db import connect
from akapela_worker.separators import MdxNetSeparator

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "server" / "db" / "migrations"
BREAKPOINT = "--> statement-breakpoint"


@pytest.fixture(autouse=True)
def never_the_real_separation_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """The real model is a network fetch and minutes of CPU, so it never runs here.

    Every test that separates injects a fake, the way every test that imports
    injects a fake fetcher. This makes that a guarantee rather than a habit: a
    test reaching `DEFAULT_HANDLERS` for a separate job fails loudly instead of
    quietly downloading model weights mid-suite.
    """

    def refuse(*args: object, **kwargs: object) -> object:
        raise AssertionError(
            "the real separation model must never run in the test suite; inject a fake Separator"
        )

    monkeypatch.setattr(MdxNetSeparator, "_backend", refuse)


def apply_app_schema(conn: sqlite3.Connection) -> None:
    """The app owns the schema; tests apply its drizzle migrations verbatim."""
    for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        for statement in sql_file.read_text(encoding="utf-8").split(BREAKPOINT):
            if statement.strip():
                conn.execute(statement)
    conn.commit()


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def conn(data_dir: Path):
    connection = connect(data_dir / "akapela.db")
    apply_app_schema(connection)
    yield connection
    connection.close()


def enqueue(
    conn: sqlite3.Connection,
    job_type: str,
    *,
    job_id: str,
    created_at: int,
    trace_parent: str | None = None,
) -> None:
    """Insert a job the way the app does: queued, no progress, no timestamps."""
    conn.execute(
        "INSERT INTO jobs (id, type, target_id, state, progress, error, created_at, trace_parent)"
        " VALUES (?, ?, NULL, 'queued', 0, NULL, ?, ?)",
        (job_id, job_type, created_at, trace_parent),
    )
    conn.commit()


def get_job(conn: sqlite3.Connection, job_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    assert row is not None, f"job {job_id} missing"
    return row

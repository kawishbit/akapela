"""Job handlers keyed by the `type` column of the jobs table."""

from __future__ import annotations

from .noop import run_noop

DEFAULT_HANDLERS = {
    "noop": run_noop,
}

"""A job that does nothing. Proves the app-to-worker round trip end to end."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..runner import JobContext


def run_noop(ctx: JobContext) -> None:
    ctx.progress(50)

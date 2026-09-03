"""Job handlers keyed by the `type` column of the jobs table."""

from __future__ import annotations

from ..sources import YtDlpFetcher
from .import_track import import_handler
from .noop import run_noop

DEFAULT_HANDLERS = {
    "noop": run_noop,
    "import": import_handler(YtDlpFetcher()),
}

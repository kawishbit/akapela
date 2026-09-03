"""Entry point: `presto-worker`. Reads PRESTO_DATA_DIR and polls forever."""

from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

from .db import connect
from .runner import Runner


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("PRESTO_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    data_dir = Path(os.environ.get("PRESTO_DATA_DIR", "./data")).resolve()
    db_path = data_dir / "presto.db"
    poll_interval = float(os.environ.get("PRESTO_POLL_INTERVAL", "1.0"))

    log = logging.getLogger("presto_worker")
    log.info("data dir %s", data_dir)
    # The app owns the schema and creates the database on its first start.
    # In compose both services start together, so wait rather than crash.
    while not db_path.exists():
        log.info("waiting for %s to be created by the app", db_path)
        time.sleep(2.0)

    conn = connect(db_path)
    Runner(conn, data_dir).run_forever(poll_interval)


if __name__ == "__main__":
    main()

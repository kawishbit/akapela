# presto-worker

Polls the `jobs` table in the shared Presto SQLite database and runs one job at a time. The app owns the schema and inserts jobs; this process owns every state transition after `queued`.

Requires `ffmpeg` and `ffprobe` on the PATH (the image installs them).

Run locally against the same data directory the app uses:

```
PRESTO_DATA_DIR=../data uv run presto-worker
```

Tests:

```
uv run pytest
```

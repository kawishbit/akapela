# akapela-worker

Polls the `jobs` table in the shared Akapela SQLite database and runs one job at a time. The app owns the schema and inserts jobs; this process owns every state transition after `queued`.

Requires `ffmpeg` and `ffprobe` on the PATH (the image installs them). YouTube imports go through yt-dlp as a library, which runs JavaScript in Node (22 or newer, also on the PATH) to solve YouTube's player challenges; the image copies the Node binary in. Without Node, yt-dlp warns and offers fewer formats.

Run locally against the same data directory the app uses:

```
AKAPELA_DATA_DIR=../data uv run akapela-worker
```

Tests:

```
uv run pytest
```

Tests never reach the network: the import job takes its Source fetcher as a parameter and the tests hand it a fake that returns canned metadata and a generated sine fixture.

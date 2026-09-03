# presto-worker

Polls the `jobs` table in the shared Presto SQLite database and runs one job at a time. The app owns the schema and inserts jobs; this process owns every state transition after `queued`.

Requires `ffmpeg` and `ffprobe` on the PATH (the image installs them). YouTube imports go through yt-dlp as a library, which wants a JavaScript runtime on the PATH to solve YouTube's player challenges; the image installs Deno. Locally, install Deno yourself or expect yt-dlp to warn and offer fewer formats.

Run locally against the same data directory the app uses:

```
PRESTO_DATA_DIR=../data uv run presto-worker
```

Tests:

```
uv run pytest
```

Tests never reach the network: the import job takes its Source fetcher as a parameter and the tests hand it a fake that returns canned metadata and a generated sine fixture.

# Nuxt app and Python worker as separate containers, SQLite as the job queue

yt-dlp, Demucs, and the audio tooling are Python; the app is Nuxt on Node. Rather than one image carrying both runtimes, docker compose runs an `app` service and a `worker` service that mount the same `/data` volume. Jobs are rows in the SQLite database on that volume; the app inserts them and reads status, the worker polls and executes them. SQLite in WAL mode handles two processes on one host, and the single-user scale never justifies Redis or a queue server. The self-hoster can size the worker's CPU and memory independently in compose.

## Considered Options

- One image with Node, Python, and ffmpeg, Nitro shelling out to Python. Rejected: bloated image, no independent resource limits.
- Worker exposing an HTTP API. Rejected: a second API surface for no benefit at one user.
- BullMQ with Redis. Rejected: an extra service for a queue that holds a handful of jobs.

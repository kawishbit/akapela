# Nuxt app and Python worker as separate containers, SQLite as the job queue

yt-dlp, Demucs, and the audio tooling are Python; the app is Nuxt on Node. Rather than one image carrying both runtimes, docker compose runs an `app` service and a `worker` service that mount the same `/data` volume. Jobs are rows in the SQLite database on that volume; the app inserts them and reads status, the worker polls and executes them. SQLite in WAL mode handles two processes on one host, and the single-user scale never justifies Redis or a queue server. The self-hoster can size the worker's CPU and memory independently in compose.

## Considered Options

- One image with Node, Python, and ffmpeg, Nitro shelling out to Python. Rejected: bloated image, no independent resource limits.
- Worker exposing an HTTP API. Rejected: a second API surface for no benefit at one user.
- BullMQ with Redis. Rejected: an extra service for a queue that holds a handful of jobs.

## Amendment: one process, not two

Worker-to-TypeScript (`.scratch/worker-to-typescript/`) deleted the Python worker. The reason for two containers was specifically that the audio tooling was Python and the app was Node — once every Job's code is TypeScript, running it in a second OS process buys nothing "one image with Node and ffmpeg, Nitro shelling out to Python" didn't already reject for the opposite reason: no independent resource limits worth having when there's nothing left to isolate a different runtime from.

What survives entirely: SQLite as the job queue, in WAL mode, rows moving through `queued` → `running` → a terminal state, one Job run at a time. `JobsRunner` (`server/lib/jobs-runner.ts`) claims and runs Jobs the same way `runner.py` did, in the same table, with the same guarantees — it just does it inside the Nuxt server's own process via a Nitro plugin rather than a polling loop in a second container. `docker-compose.yml` now runs one service; the resource limits that were split `1 CPU / 512M` (app) and `2 CPU / 2G` (worker) are now one `2 CPU / 2G` allotment, since vocal removal — the reason the worker got the bigger number — is still the heaviest thing this app does, just run as a subprocess of the one remaining service rather than inside a second one.

What changed the concurrency picture, and is worth naming rather than assuming away: two containers gave the Worker's Jobs a genuinely separate process from the app's HTTP handling for free. In-process, a Job's handler code runs on the same event loop as every request — fine for I/O-bound work (ffmpeg, yt-dlp are spawned subprocesses either way, so awaiting one never blocks the loop), but the separate Job's ONNX inference is real CPU work, which is why it's spawned into its own subprocess (`server/lib/separators/separate-cli.ts`) rather than run in process — the one piece of this ADR's original isolation this repo still needed, recreated at the Job level instead of the container level.

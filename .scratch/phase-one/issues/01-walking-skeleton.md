# 01: Walking skeleton: compose, database, job round trip

**What to build:** A self-hoster runs `docker compose up` and gets the Akapela app and the worker running against one shared data volume. Opening the app shows an empty library page already in the DESIGN.md look: near-black surfaces, Figtree self-hosted, pill buttons, green accent, Lucide icons, installable as a PWA. Behind it, the app can enqueue a no-op job into the SQLite jobs table, the worker picks it up, runs it, marks it succeeded, and the page shows the job's status by polling. This proves every layer is wired before any real feature lands.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `docker compose up` starts an `app` service (Nuxt 4, pnpm, TypeScript strict, Tailwind v4, Drizzle with better-sqlite3 in WAL mode) and a `worker` service (Python 3.12 via uv) that both mount the same data volume
- [x] The data directory path and HTTP port are configurable by environment variables, with sensible defaults
- [x] The database schema includes a jobs table with type, target id, state (queued, running, succeeded, failed), error, progress, and timestamps; migrations run on app start
- [x] The worker polls the jobs table on a short interval, runs one job at a time in queue order, and records success or failure with the error message
- [x] On startup the worker resets any job left in running state back to queued
- [x] An API route enqueues a no-op job and another reports job status; the library page shows the status updating from queued to succeeded
- [x] The library page renders with DESIGN.md tokens, self-hosted Figtree, Lucide icons, a persistent bottom bar placeholder, and a PWA manifest that makes the app installable
- [x] The app test harness invokes route handlers in-process against a real SQLite database and data directory in a temp folder, and has at least one passing test for the job round trip
- [x] The worker test harness runs the job runner against a temp data directory and a temp database, and has passing tests for job execution, failure recording, and stale-job reset on startup
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the worker's test command all pass

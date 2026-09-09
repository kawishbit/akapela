# 02: In-process job runner replaces the Python polling loop

**What to build:** From the outside, nothing changes yet — no Job type has moved off the Python worker. What ships is the mechanism every later ticket in this effort depends on: the Nuxt server itself claims the oldest queued Job, runs it, and marks it succeeded or failed, recovering any Job left `running` by a previous crash — the same guarantees `runner.py` gives today, running in-process instead of as a second process. Proven end to end with a no-op Job handler. CPU-bound handlers get a lane to run off the main thread so the HTTP server stays responsive once real handlers land here.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The Nuxt server claims and completes queued Jobs without a separate worker process running
- [x] A Job left `running` by a crashed/killed server is requeued on the next boot
- [x] Job progress and terminal state (succeeded/failed with an error message) are visible the same way they are today
- [x] A mechanism exists for a handler to do CPU-heavy work without blocking the HTTP server (a worker thread or equivalent)
- [x] Proven end-to-end with a no-op Job type; no production Job type is wired to this runner yet

## Result

`server/lib/jobs-runner.ts`'s `JobsRunner` ports `runner.py` 1:1 (claim
oldest-queued, recover stale-running, terminal state + progress), wired into
production via a new Nitro plugin (`server/plugins/jobs-runner.ts`) that
starts `runForever` on boot. 8 tests in `tests/unit/jobs-runner.test.ts` port
`test_runner.py`'s cases (minus OTel span coverage — Job tracing is a real
but separate gap, see below).

Verified end-to-end on a live dev server: `POST /api/jobs {type: noop}`
reached `succeeded`/100 in under a second with no Python process running.

A `worker-thread.ts` primitive was also built here for CPU isolation, proven
not to block the event loop by its own test — but nothing in this ticket
needed it yet (only `noop` existed). It turned out not to be the right
mechanism once ticket 06 had a real CPU-bound job to isolate: `import.meta.url`,
which it needed to locate a worker entry file, is rewritten by Nitro into a
`.nuxt` virtual path even under `pnpm dev`, not a real filesystem path.
Ticket 06 built `child_process`-based isolation instead (matching how
ffmpeg/yt-dlp already run) and deleted `worker-thread.ts` as dead code.

**Known gap, not carried forward silently**: the Python runner's OTel job
span (joining a Job's trace to the request that enqueued it) was not
ported. Dev-only tooling (ADR 0007), not a correctness gap — flagged here
for whoever next touches telemetry rather than silently dropped.

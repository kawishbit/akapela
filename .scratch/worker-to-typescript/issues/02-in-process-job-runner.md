# 02: In-process job runner replaces the Python polling loop

**What to build:** From the outside, nothing changes yet — no Job type has moved off the Python worker. What ships is the mechanism every later ticket in this effort depends on: the Nuxt server itself claims the oldest queued Job, runs it, and marks it succeeded or failed, recovering any Job left `running` by a previous crash — the same guarantees `runner.py` gives today, running in-process instead of as a second process. Proven end to end with a no-op Job handler. CPU-bound handlers get a lane to run off the main thread so the HTTP server stays responsive once real handlers land here.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Nuxt server claims and completes queued Jobs without a separate worker process running
- [ ] A Job left `running` by a crashed/killed server is requeued on the next boot
- [ ] Job progress and terminal state (succeeded/failed with an error message) are visible the same way they are today
- [ ] A mechanism exists for a handler to do CPU-heavy work without blocking the HTTP server (a worker thread or equivalent)
- [ ] Proven end-to-end with a no-op Job type; no production Job type is wired to this runner yet

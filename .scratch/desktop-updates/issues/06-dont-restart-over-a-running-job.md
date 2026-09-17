# 06: Don't restart over a running Job

**What to build:** Once an Update has downloaded, **Restart now** is disabled while any Job is running, and a short note says why ("a Job is still running"). It becomes available again when the queue is empty. **Install when I quit** stays available the whole time. That way an Update the singer asked for doesn't quietly throw away a Separation that's minutes in. An ordinary quit is still not guarded, as ADR 0009 says.

**Blocked by:** 05 (Install an Update in place on Windows and Linux)

**Status:** ready-for-human

- [ ] With a Separation running, **Restart now** is disabled with the note, and **Install when I quit** still works
- [ ] When the Job finishes, **Restart now** becomes available without reopening the prompt
- [ ] With no Job running, **Restart now** is available immediately

## Comments

Built. `GET /api/jobs/busy` answers it (covered in `tests/api/jobs.test.ts`), the prompt polls it only once an Update is ready, and `promptOffers` blocks the restart while it is true. The three boxes need a real download to sit behind them, so they wait on a packaged build.

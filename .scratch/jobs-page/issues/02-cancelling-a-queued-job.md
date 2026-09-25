# 02: `cancelled` Job state, and cancelling a queued Job

**What to build:** A fourth terminal Job state, `cancelled`, and the API that puts a queued Job into it. Running Jobs come in ticket 03; this one only has to refuse them cleanly.

`cancelled` joins `succeeded` and `failed` in `JOB_STATES` (a migration for the existing `state` column's enum if one is needed). `CONTEXT.md`'s **Job** entry already says what it means: the singer stopped it, and whatever it was working on goes back to how it was before it was asked for. Make that true per type:

- **Separation:** the Track returns to `none` if it had no Stems, or to `ready` if it was being re-separated and its Stems are still there. No new `SeparationState`; a Track the singer changed their mind about should look untouched.
- **Import:** the Track is deleted, the same way `DELETE /api/tracks/:id` deletes it — rows, Jobs, and directory.
- **Mix (`render`):** the Mix row is deleted.

Routes, named rather than a state-setting PATCH:

- `POST /api/jobs/:id/cancel` — queued only for now; a running Job returns a clear error until 03 lands, and a finished one is a no-op that says so.
- `POST /api/jobs/:id/retry` — for a failed Job, through the domain functions that already exist (`retryImport`, `startSeparation`, the Mix render request). A **new** Job row, as every retry does today; the failed row keeps its error.
- `POST /api/jobs/clear` — removes succeeded Jobs, cancelled Jobs, and failed Jobs that have already been retried (a newer Job exists for the same target and type). A failed Job that is still the latest word on its target stays, because the Track page reads its error message.
- `GET /api/jobs` — the list the page will render: every Job with its state, progress, error, timestamps, type, and enough of its target to name it (Track title and cover; for a `render`, the Take behind the Mix).

The cancel and retry cleanup is domain work: put it in `server/lib/jobs.ts` (or beside the per-type code it belongs to), not in the route handlers.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A queued Separation, import, and Mix can each be cancelled, and the Job row ends `cancelled`
- [ ] Cancelling a Separation on a Track with no Stems leaves it `none`; on a Track being re-separated it leaves it `ready` with its Stems intact
- [ ] Cancelling an import deletes the Track, its rows, and its directory
- [ ] Cancelling a Mix deletes the Mix row and leaves its Take alone
- [ ] Cancelling a finished Job changes nothing and says why; cancelling a running one is refused until 03
- [ ] Retry enqueues a new Job through the existing domain functions and leaves the failed row's error intact
- [ ] Clear removes succeeded and cancelled Jobs, keeps a failed Job that is still the latest for its target, and removes one that has been retried
- [ ] `GET /api/jobs` returns what a row needs without a second request per Job
- [ ] `GET /api/jobs/busy` still answers "anything queued or running, in either Lane"
- [ ] Tests cover each cancel path's cleanup, the clear rules, and retry leaving the old row alone
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

# 02: A cancel just as a Job finishes undoes finished work

**Status:** needs-triage

**What happens:** a handler can return successfully before the runner's `UPDATE jobs SET state = 'succeeded' … AND state = 'running'` runs on a later microtask. A cancel that lands in that gap still matches `state IN ('queued', 'running')`, marks the row `cancelled`, and `undoJob` then does its per-type cleanup on work that actually finished: it deletes a fully imported Track, or deletes a Mix whose files were just written.

**Where:** `server/lib/job-actions.ts` (`cancelJob`, `undoJob`) and `server/lib/jobs-runner.ts` (`runOnce`).

**Why it was left:** the gap is a microtask or two, which a click from the Jobs page is very unlikely to hit.

**A way to fix it:** have the runner record completion in the registry before it writes the row. `RunningJobs` could hold a `finished` flag set the moment the handler resolves, and `cancelJob` could refuse ("This Job has already finished") when it sees the flag, instead of undoing. Or make the handler's own last step and the row's terminal state one transaction.

**Test:** a runner test with a handler that resolves, and a cancel issued before `runOnce` returns; the target must survive and the row must end `succeeded`.

## Comments

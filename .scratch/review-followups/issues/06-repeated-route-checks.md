# 06: Repeated checks and messages in the Queue and Job routes

**Status:** needs-triage

Tidy-up, no behaviour change. Flagged by the Standards half of the review as judgement calls:

- **The singer's-name check is written twice:** `server/api/queue.post.ts` and `server/api/queue/[id].patch.ts` both carry `singerName !== undefined && singerName !== null && typeof singerName !== 'string'` → "A singer's name is text". It belongs in `server/lib/queue.ts` beside `normalizeSingerName`.
- **"That entry is no longer in the Queue" appears in four routes.** It could be one constant, or a `requireQueueEntry(event)` in the shape of `require-track.ts`.
- **The same try/catch is in two routes:** `server/api/jobs/[id]/cancel.post.ts` and `retry.post.ts` both catch `JobActionRefused` and turn it into a 409. One small wrapper would do.
- **The latest-separate-Job subquery is written twice:** `latestSeparationJobId` in `server/lib/tracks.ts` and the `LEFT JOIN jobs j ON j.id = (…)` in `server/lib/queue.ts`'s `SELECT_ENTRIES`.
- **The same switch on Job type in four places:** `server/lib/job-actions.ts` switches on `job.type` in `undoJob`, `retryJob`, the `TARGET_GONE` SQL and `listJobs`' join. A new Job type means editing all four; one per-type table of "how to undo, how to retry, what the target is" would make that one edit.
- **Duplicated wording in the shell:** `desktop/src/main.ts`'s `connectTo` and `describeProbe` both word "not Akapela" and both run the newer-version check.
- **Domain rule in a route:** "a Track can be queued once it has imported" lives in `server/api/queue.post.ts`, the way `separate.post.ts` already guards separation, rather than in `server/lib/queue.ts`.

## Comments

# 03: Cancelling a running Job

**What to build:** Cancel that works on the Job that is actually running, not only the ones waiting.

`JobContext` gains a `signal: AbortSignal`. The runner keeps a `jobId → AbortController` map of what it is running in that process; `POST /api/jobs/:id/cancel` marks the row `cancelled` and aborts the controller if the id is in it. The runner and the API share a process, so this stays a few lines in `jobs-runner.ts` — no polling of the row from inside a handler.

A cancelled run must not be recorded as a failure: when the handler returns or throws after its signal aborted, the row stays `cancelled` with no error message, and the per-type cleanup from ticket 02 runs exactly as it does for a queued Job.

Every handler takes the signal and stops on it:

- **`separate`:** kill the `separate-cli.ts` subprocess, remove the scratch separation directory, and never `rename` a partial Stem over the Track's existing one. Cancelling between chunks is the common case; cancelling mid-chunk must still leave the Track's old Stems untouched.
- **`import`:** kill the spawned yt-dlp or ffmpeg, and let ticket 02's cleanup delete the Track and its directory.
- **`render`:** kill ffmpeg and remove the partial file.
- **`noop`:** returns early.

Keep using `childEnv()` for anything spawned, as today.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A running Separation stops within a chunk or two, not at the next milestone
- [ ] Its subprocess is gone afterwards — nothing keeps burning CPU
- [ ] A cancelled re-separation leaves the Track `ready` with its previous Stems, byte for byte
- [ ] A cancelled first Separation leaves the Track `none` and no partial Stems on disk
- [ ] A cancelled import kills its child process and leaves no Track and no directory behind
- [ ] A cancelled Mix leaves no partial file
- [ ] The Job row ends `cancelled` with no error message, never `failed`
- [ ] The Lane picks up the next Job immediately after a cancel
- [ ] Shutdown still lets a running Job finish (`runForever`'s abort is a different signal from a cancel; do not conflate them)
- [ ] Tests cover abort mid-handler for each type, including that the old Stems survive
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

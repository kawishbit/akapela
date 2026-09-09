# 08: Back up and restore your library from Settings

**What to build:** A Settings page offering "Download backup" and "Restore from backup." Backing up checkpoints the database's WAL and archives the user-data tree (the database plus every Track's files, cache excluded per ticket 01) into a single downloadable file. Restoring takes that file and unpacks it into a data directory, refusing to silently clobber an existing library without explicit confirmation. Sequenced after the Python worker is gone so it's built and tested against the app's final architecture rather than a mid-migration one.

**Blocked by:** 07 (delete the Python worker)

**Status:** done

- [x] "Download backup" produces a single archive containing the database and every Track's files, and excludes the cache path from ticket 01
- [x] The WAL is checkpointed before archiving so the backup is never missing recently-committed writes
- [x] "Restore from backup" unpacks an archive produced by "Download backup" into a data directory and the app works normally afterward
- [x] Restoring into a data directory that already has Tracks requires explicit confirmation before anything is overwritten
- [x] A restored library is verified against a library backed up in the same test — the round trip is actually exercised, not just each direction in isolation

## Result

`server/lib/backup.ts`: `createBackupArchive` (WAL checkpoint via
`PRAGMA wal_checkpoint(TRUNCATE)`, then a `tar.gz` of exactly `akapela.db` and
`tracks/` — `cache/` excluded by only ever listing those two entries, not by
filtering it out), `hasLibraryData`, `stageRestore` (extracts + validates into
a staging directory *inside* the data directory, so the final move is a same-
filesystem `rename`, not a cross-device copy), and `applyStagedRestore`
(closes the database connection, swaps the files, leaves restarting the
process to the caller).

Routes: `GET /api/backup` streams the archive with a real
`content-disposition: attachment`; `POST /api/backup/restore` (multipart,
`file` + `confirm`) 409s if the library has Tracks and `confirm` wasn't sent,
400s on a file that isn't a real backup, and on success responds `202` then
calls `process.exit(0)` ~250ms later.

**Why a process exit, not a live in-place swap**: the running process holds
open a `JobsRunner` and a database connection built around the *old* files.
Swapping those live risks the in-process job poller continuing to touch
files that no longer exist. Exiting and letting the process come back is
simpler and safer than trying to hot-swap that state correctly — and
`docker compose`'s `restart: unless-stopped` already treats any exit,
graceful or not, as "bring me back."

**The real round trip**, tested directly against `server/lib/backup.ts` — no
HTTP, no process exit — in `tests/unit/backup.test.ts`: back up a library
with Tracks and a file on disk, restore it into a *different* library that
already had different Tracks, reopen a fresh connection against the restore
target's data directory (standing in for the process restart), and confirm
what comes back matches the source exactly — not the target's stale data.
Also covers: `cache/` excluded, WAL-only writes survive the checkpoint, a
non-tar file is rejected, and a tar with no `akapela.db` in it is rejected.
`tests/api/backup.test.ts` covers what the HTTP route decides before it
would ever reach the exit — download shape, no-file, and needs-confirmation
— deliberately not a *successful confirmed* restore through the route, since
that would call `process.exit()` inside the test runner's own process.

**Verified live**, not just in the test suite: a real dev server, a real
browser (file upload via the hidden `<input type="file">`, not the native
picker — Confirm dialog rendering correctly with the actual filename,
"Restored. Waiting for the app to come back…" state), and separately a real
production build (`node .output/server/index.mjs`) where a confirmed restore
was shown to actually terminate the process and, on manual restart, serve
the restored library correctly.

**A real finding, not assumed**: `process.exit()` inside a request handler
does not actually terminate the process under `pnpm dev`/`aspire run` —
Nitro's dev server runs request handling in its own worker, and the CLI's
outer process survives the exit but doesn't recover from it either (it logs
"worker exited with code 0" and serves 500s afterward). Confirmed by
triggering a real restore under `pnpm dev` and watching it happen, not
inferred. This is exactly the case `settings.vue`'s `waitForRestart` already
handles: it polls for up to two minutes, then tells the singer to restart by
hand, correctly distinguishing "still coming back" from "never going to."
Only the production build path — a plain `node` process, no dev-mode
wrapper — is what a self-hoster's `docker compose` actually runs, and that
path was separately confirmed to exit and restart cleanly.

## Not covered

A fresh self-hoster's `git clone` → `docker compose up -d` → restore path
specifically through Docker (verified through the production *build*
directly, and separately through `docker compose` for import/render/
separate in ticket 07, but not the two combined for restore specifically).
Restoring a very large library (this session's test data was small; the
`tar` streaming API should scale, but wasn't exercised at real Track-library
size). Concurrent requests arriving in the moment between `applyStagedRestore`
closing the database connection and the process actually exiting — a request
there gets a 500, not corruption, but it's a real (small) window, inherent
to the "checkpoint then close, don't try to lock out every other request"
design rather than something this ticket tried to eliminate.

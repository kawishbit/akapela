# 01: A late cancel can still replace a Track's Stems

**Status:** needs-triage

**What happens:** `server/lib/jobs/separate.ts` checks `ctx.signal.throwIfAborted()` for the last time just before the two `rename`s that move the new Stems over the Track's existing ones. A cancel that lands between the first and second `rename`, or after both but before the final `UPDATE tracks SET separation_state = 'ready'`, lets the new Stems in. The Job row ends `cancelled`, `undoJob` sees Stems on disk and leaves the Track `ready`, so the Track keeps Stems the singer asked not to have, and a re-separation's old Stems are gone.

**Spec it breaks:** `.scratch/jobs-page/spec.md`: "A Separation's scratch Stems must never replace the ones already on the Track."

**Why it was left:** the window is two `rename`s wide, a few milliseconds against a Separation of minutes.

**A way to fix it:** make the swap one step a cancel can't split. Rename the Track's current Stems aside (`stems.old/`) first, then move the new ones in, then check the signal. If it aborted, move the old ones back. Otherwise delete `stems.old/`. Alternatively, once the renames begin, have `cancelJob` refuse a running Separation with "Too late to cancel: the Stems are being written". A flag on the running entry in `server/lib/running-jobs.ts` would do it.

**Test:** a `HangingSeparator`-style fake in `tests/unit/jobs/cancel.test.ts` that aborts from inside the rename window, asserting the old Stems survive byte for byte.

## Comments

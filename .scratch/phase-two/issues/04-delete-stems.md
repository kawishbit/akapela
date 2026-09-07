# 04: Delete Stems and reclaim disk

**What to build:** A way back. Two Stems are roughly 80 MB per Track at ADR 0005's rates, so separating a sixty-Track library is about five gigabytes. The Track delete cascade already sweeps the whole directory, but without a per-Track reclaim the only way to get that space back is deleting Tracks you want to keep. Track detail gets a **Delete Stems** action that removes both files, returns `backing_source` to `original`, and returns `separation_state` to `none`, leaving the Track itself and every Take and Mix under it untouched.

Note the interaction with ticket 09: deleting Stems must not orphan a Mix. A Mix carries its own `backing_source`, so re-rendering one that named `instrumental` after the Stems are gone has to fail with a clear message rather than silently rendering the wrong audio.

**Blocked by:** 03 (Backing Source on the Track)

**Status:** done

- [x] `DELETE /api/tracks/:id/stems` removes both Stem files, sets `backing_source` back to `original`, and sets `separation_state` back to `none`
- [x] Track detail shows the action with the disk space it will reclaim, behind one confirmation, matching how Track deletion already confirms
- [x] Takes and Mixes under the Track are untouched by the deletion
- [x] Re-rendering a Mix whose `backing_source` is `instrumental` after the Stems are gone fails with a message naming the missing Stems, rather than falling back to the original
- [x] API tests cover the deletion, the files actually leaving disk, the two state resets, and the missing-Stems render failure

## Comments

The render-failure item was left unchecked here because `mixes` had no `backing_source` of its own yet, and the render job always read `backing.wav` regardless of the Track's current Backing Source. Ticket 09 added `mixes.backing_source` and the render-job guard: `run_render` now selects the file the Mix's own `backing_source` names and raises `FileNotFoundError` naming it when that file is missing, tested in `worker/tests/test_render.py`.

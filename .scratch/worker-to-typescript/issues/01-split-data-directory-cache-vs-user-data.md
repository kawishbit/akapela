# 01: Split the data directory into user data and cache

**What to build:** From a self-hoster's perspective, nothing changes — Tracks, the database, and settings behave identically. Internally, everything that is safe to lose because it simply re-downloads (the vocal-separation model weights) moves under a cache-namespaced subtree of the data directory, separate from everything that is not (the database and every Track's files). Both the app and the still-Python worker agree on the new cache path. A data directory left over from before this change keeps working.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Model weights are downloaded to and read from a cache-namespaced path under the data directory (e.g. `cache/models/`), distinct from Track and database storage
- [x] Track files and `akapela.db` remain directly under the data directory root, unchanged
- [x] A data directory containing model weights from before this change continues to work without a manual migration step (moved automatically, or safe to delete and it just re-downloads)
- [x] Existing tests pass against the new path
- [x] Something in the codebase makes "what counts as user data vs. cache" answerable in one place, so ticket 08 (backup/restore) doesn't need its own hand-maintained list

## Comments

**This was built and shipped; only the status line was stale.** Every later ticket in this series depends on it, including 08, which is marked done. Closing it against what is actually in the tree, and against a run rather than only a read:

- `MODELS_DIRNAME = 'cache/models'` in `server/lib/jobs/separate.ts`, with `LEGACY_MODELS_DIRNAME = 'models'` beside it. `akapela.db` is opened at the data directory root (`server/lib/akapela.ts`) and a Track's directory is `<dataDir>/tracks/<id>` (`server/lib/jobs/track-paths.ts`) — both unchanged.
- **The migration was exercised, not just read.** A library with the model at `cache/models/` was put back into the pre-split shape by moving it to `models/`, and a separation was started. `models/` was gone afterwards and `cache/models/UVR-MDX-NET-Inst_Main.onnx` was back **carrying its original mtime** — renamed, not re-downloaded — and the separation then succeeded against it, so the moved file still loads.
- The one place that answers user data vs. cache is `BACKUP_ENTRIES = ['akapela.db', 'tracks']` in `server/lib/backup.ts`. It is an allowlist, so `cache/` is excluded by construction rather than by a list someone has to remember to update. Observed on a real library: the archive came back **5.0 MB against a 57 MB data directory**, leaving the 52 MB model behind.
- `tests/unit/backup.test.ts` covers the exclusion directly; the full suite passes.

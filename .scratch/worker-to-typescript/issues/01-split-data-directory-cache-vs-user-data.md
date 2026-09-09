# 01: Split the data directory into user data and cache

**What to build:** From a self-hoster's perspective, nothing changes — Tracks, the database, and settings behave identically. Internally, everything that is safe to lose because it simply re-downloads (the vocal-separation model weights) moves under a cache-namespaced subtree of the data directory, separate from everything that is not (the database and every Track's files). Both the app and the still-Python worker agree on the new cache path. A data directory left over from before this change keeps working.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Model weights are downloaded to and read from a cache-namespaced path under the data directory (e.g. `cache/models/`), distinct from Track and database storage
- [ ] Track files and `akapela.db` remain directly under the data directory root, unchanged
- [ ] A data directory containing model weights from before this change continues to work without a manual migration step (moved automatically, or safe to delete and it just re-downloads)
- [ ] Existing tests pass against the new path
- [ ] Something in the codebase makes "what counts as user data vs. cache" answerable in one place, so ticket 08 (backup/restore) doesn't need its own hand-maintained list

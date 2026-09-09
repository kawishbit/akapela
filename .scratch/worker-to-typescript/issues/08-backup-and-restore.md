# 08: Back up and restore your library from Settings

**What to build:** A Settings page offering "Download backup" and "Restore from backup." Backing up checkpoints the database's WAL and archives the user-data tree (the database plus every Track's files, cache excluded per ticket 01) into a single downloadable file. Restoring takes that file and unpacks it into a data directory, refusing to silently clobber an existing library without explicit confirmation. Sequenced after the Python worker is gone so it's built and tested against the app's final architecture rather than a mid-migration one.

**Blocked by:** 07 (delete the Python worker)

**Status:** ready-for-agent

- [ ] "Download backup" produces a single archive containing the database and every Track's files, and excludes the cache path from ticket 01
- [ ] The WAL is checkpointed before archiving so the backup is never missing recently-committed writes
- [ ] "Restore from backup" unpacks an archive produced by "Download backup" into a data directory and the app works normally afterward
- [ ] Restoring into a data directory that already has Tracks requires explicit confirmation before anything is overwritten
- [ ] A restored library is verified against a library backed up in the same test — the round trip is actually exercised, not just each direction in isolation

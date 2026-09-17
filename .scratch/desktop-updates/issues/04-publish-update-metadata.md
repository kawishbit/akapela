# 04: Publish the update metadata with every Release

**What to build:** Each Release carries the files an installed Desktop App needs to update itself on Windows and Linux: the update metadata (`latest.yml` for Windows, `latest-linux.yml` for the AppImage) and the blockmaps, next to the installers and their `.sha256` files. macOS publishes none, since its DMG can't be updated in place while unsigned (ADR 0009's amendment on Updates).

A Release that has installers but no metadata looks fine until an installed app tries to update, so a missing file fails the build. That also covers the dry run (ADR 0011's dry-run amendment): a dry run's workflow artifacts show the metadata before any real Release is cut.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Windows and Linux build legs fail with a clear error if their update metadata or blockmap is missing
- [ ] A dry run's workflow artifacts contain `latest.yml`, `latest-linux.yml`, and the blockmaps next to the installers
- [ ] A real Release publishes those files as assets, and the checksum in each metadata file matches its published installer
- [ ] The comment in the electron-builder config saying "nothing reads" the metadata is corrected

## Comments

# 04: Publish the update metadata with every Release

**What to build:** Each Release carries the files an installed Desktop App needs to update itself on Windows and Linux: the update metadata (`latest.yml` for Windows, `latest-linux.yml` for the AppImage) and the blockmaps, next to the installers and their `.sha256` files. macOS publishes none, since its DMG can't be updated in place while unsigned (ADR 0009's amendment on Updates).

A Release that has installers but no metadata looks fine until an installed app tries to update, so a missing file fails the build. That also covers the dry run (ADR 0011's dry-run amendment): a dry run's workflow artifacts show the metadata before any real Release is cut.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] The Windows and Linux build legs fail with a clear error if their update metadata or blockmap is missing (Windows: `latest.yml` + `*.exe.blockmap`; Linux: `latest-linux.yml`, since an AppImage embeds its blockmap rather than writing one beside it)
- [x] A dry run's workflow artifacts contain `latest.yml`, `latest-linux.yml`, and the blockmaps next to the installers
- [ ] A real Release publishes those files as assets, and the checksum in each metadata file matches its published installer
- [x] The comment in the electron-builder config saying "nothing reads" the metadata is corrected

## Comments

Built. The build legs fail without their platform's metadata, the upload carries `latest*.yml` and the blockmaps, and the macOS leg deletes `latest-mac.yml` (an unsigned app cannot honour it).

Proved by dry run [35258007311](https://github.com/kawishbit/akapela/actions/runs/35258007311) on `feature/desktop-updates`: all three legs green, and the upload counts say what each carries — Windows 4 files (`.exe`, `.sha256`, `latest.yml`, `.exe.blockmap`), Linux 3 (`.AppImage`, `.sha256`, `latest-linux.yml`), macOS 2 (`.dmg`, `.sha256`) with no `latest-mac.yml`.

What is left needs a real Release: that its assets carry the metadata, and that each checksum matches its published installer.

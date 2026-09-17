# 05: Install an Update in place on Windows and Linux

**What to build:** On Windows and Linux, **Update now** in the prompt downloads the Update itself, with nothing downloaded until the singer asks. The prompt shows download progress, then offers **Restart now** (install and relaunch) or **Install when I quit** (installs the next time the singer quits, through the same quit path that already stops the server cleanly). A Windows install is per-user, so there's no admin prompt and the chosen install folder is kept.

`electron-updater` only downloads and installs. The existing launch check still decides whether there is an Update (ADR 0009's amendment on Updates). If the updater finds a different version than the check did, for example a Release still uploading its assets, that counts as a failure.

Every failure has the same outcome: the prompt says it couldn't update and offers the Release page link, the same thing macOS always gets. This covers missing metadata, a checksum mismatch, a lost connection, a version disagreement, and an AppImage that wasn't launched as an AppImage. The error is appended to the server log file the shell already writes, and nothing retries on its own. When the shell is unpackaged or attached to a dev server, it never touches the updater.

**Blocked by:** 01 (Prompt the singer about an Update at launch), 04 (Publish the update metadata with every Release)

**Status:** ready-for-agent

- [ ] On Windows, an installed older Release updates to the latest one through **Update now** → **Restart now**, and relaunches on the new version with its library, port, and window bounds intact
- [ ] On Linux, a launched older AppImage does the same
- [ ] **Install when I quit** applies the Update on the next quit, and the next launch runs the new version
- [ ] macOS, and an AppImage not launched as one, get **Update now** → the Release page, as in ticket 01
- [ ] A forced failure (e.g. a Release with no metadata) shows the fallback link and writes the error to the server log
- [ ] Unpackaged or attached runs never start a download
- [ ] Which path a platform takes (install in place, or link) is a plain function covered by the root vitest suite

## Comments

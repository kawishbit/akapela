# 02: Direct downloads for the latest Release

**What to build:** A visitor gets the right installer in one click. On load, the page asks GitHub's public API for the latest Release of `kawishbit/akapela` and upgrades the buttons from ticket 01: each becomes a direct link to its installer, shows the Release's version, and carries a small link to that installer's `.sha256`.

The visitor's platform becomes the primary button; the other two sit beneath it. macOS is labelled Apple Silicon and never guesses at Intel. On a phone or tablet, or an unrecognised platform, all three are shown as equals with a note that Akapela is a desktop app.

If the API call fails, is rate-limited, or the Release is missing an installer, that button (or all of them) keeps ticket 01's link to the Release page. Nothing shows as broken or empty.

The platform detection and the matching of Release assets to Windows / macOS / Linux live in one plain function with no DOM or network in it, covered by the root vitest suite in the same way `tests/unit/desktop/` covers the shell. Match on what the release workflow actually produces (`.exe`, `-arm64.dmg`, `.AppImage`, each with a `.sha256` sibling), and ignore the update metadata and blockmaps.

**Blocked by:** 01 — Website skeleton, in the Hallmark design

**Status:** done

- [x] With the API reachable, each button links directly to its installer from the latest Release and shows its version
- [x] Each available installer has a `.sha256` link beside it
- [x] Windows, macOS, and Linux visitors each see their own platform as the primary button
- [x] macOS is labelled Apple Silicon; there is no Intel option or guess
- [x] Phones, tablets, and unknown platforms see all three with the desktop-app note
- [x] With the API blocked or failing, the page is exactly ticket 01's: every button opens the Release page
- [x] A Release missing one installer falls back for that button only
- [x] The detection/matching function has root vitest coverage, including a real Release's asset list (v1.2.2) and the missing-asset and unknown-platform cases

## Comments

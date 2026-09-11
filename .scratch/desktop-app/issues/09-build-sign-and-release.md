# 09: Building, signing, and shipping a release

**What to build:** Installers that other people can actually open, built somewhere that can build all of them.

Cross-building is the forcing function: a macOS DMG has to be built and notarized on a macOS runner, so this is a GitHub Actions matrix rather than something done from a development machine.

**macOS is signed and notarized.** This is not polish. An unsigned macOS build is *refused* — "Akapela is damaged and can't be opened" — not warned about, and a normal user has no way past it. The Apple Developer account is $99/yr and it is the difference between a mac build existing and not existing.

Notarization requires the hardened runtime, and the hardened runtime is where the microphone dies silently: without `NSMicrophoneUsageDescription` in the Info.plist and the `com.apple.security.device.audio-input` entitlement, `getUserMedia` fails at the exact moment someone presses record. There is no build-time error for this. It only shows up when a human tries to sing.

**Windows is not signed initially.** SmartScreen warns and can be clicked through, which is a real but survivable cost; an OV certificate is a few hundred dollars a year for a first release nobody has installed yet. Document the click-through and revisit if people actually hit it.

**No auto-updater.** electron-updater is real machinery with real failure modes, and the honest v1 is a version check against the latest release that shows a quiet notice linking to the Releases page. Ship that; add updating later if the app earns it.

**Blocked by:** 05 (there has to be something to sign)

**Status:** ready-for-human

- [x] A GitHub Actions workflow builds Windows and macOS on a tag, with Linux AppImage included if it comes free
- [ ] macOS builds are signed and notarized, with credentials in repository secrets and never in the repo; a stapled DMG opens on a machine that has never seen the app
- [ ] `NSMicrophoneUsageDescription` and the audio-input entitlement are present, **verified by recording a Take in the notarized build** — the failure mode is silent and nothing else catches it
- [x] Artifacts are published to GitHub Releases with checksums
- [x] Windows builds are unsigned for now, and the SmartScreen click-through is written down for the README ticket to use
- [ ] The app checks the latest release on startup and shows an unobtrusive notice with a link when a newer one exists; no downloading, no installing, no auto-update
- [ ] A clean-machine install is done by hand per platform, at minimum: open the app, import a local file, record a Take, render a Mix, download it, separate a Track, import from YouTube, and restore a backup

## Comments

The workflow and the configuration are written; the parts that need an Apple Developer account, signing secrets, and a clean machine per platform are not, and cannot be from here.

Written and reviewable:

- `.github/workflows/desktop-release.yml` — a matrix over `windows-latest`, `macos-latest` (arm64), `macos-13` (x64), and `ubuntu-latest`, triggered on a `v*` tag or by hand. Each leg runs the root checks and `pnpm build`, installs `desktop/` from inside its own directory, fetches the pinned binaries for that platform, packs, and writes a `.sha256` beside every artifact. A `publish` job downloads them all and creates the GitHub Release.
- `desktop/electron-builder.yml` — NSIS on Windows, DMG on macOS for both arches, AppImage on Linux. `hardenedRuntime: true`, `notarize: true`, and `NSMicrophoneUsageDescription` in `extendInfo`.
- `desktop/resources/entitlements.mac.plist` — `com.apple.security.device.audio-input`, plus `allow-jit` and `allow-unsigned-executable-memory` (Electron's V8 needs both under the hardened runtime) and `disable-library-validation`/`allow-dyld-environment-variables`, since the server, the separation CLI, ffmpeg, and a yt-dlp downloaded after signing are all real child processes.
- The version check that stands in for an updater: `desktop/src/update-check.ts` asks GitHub for the latest release once at startup, ignores drafts and prereleases, compares numerically, and returns null on any failure — nobody is blocked on the answer. Settings shows a one-line notice with a link when there is one. No downloading, no installing, no electron-updater. Covered by `tests/unit/desktop/update-check.test.ts`.

Not done, and honestly unticked:

- **Signing and notarization.** No Apple Developer account, no certificate, no secrets. The workflow reads `MAC_CERTIFICATE_P12`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` from repository secrets; someone has to put them there. Until then there is no mac build, because an unsigned one is refused outright rather than warned about.
- **The microphone entitlement verified by recording a Take in a notarized build.** This is the one the ticket flags as silent, and it is still unverified. Nothing catches it but a human singing into a signed build.
- **A clean-machine install per platform.** None done.

For the README ticket: **the SmartScreen click-through** is "Windows protected your PC" → **More info** → **Run anyway**, once, on first run of an unsigned installer. That wording is now in `README.md`.

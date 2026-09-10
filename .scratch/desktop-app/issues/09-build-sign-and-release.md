# 09: Building, signing, and shipping a release

**What to build:** Installers that other people can actually open, built somewhere that can build all of them.

Cross-building is the forcing function: a macOS DMG has to be built and notarized on a macOS runner, so this is a GitHub Actions matrix rather than something done from a development machine.

**macOS is signed and notarized.** This is not polish. An unsigned macOS build is *refused* — "Akapela is damaged and can't be opened" — not warned about, and a normal user has no way past it. The Apple Developer account is $99/yr and it is the difference between a mac build existing and not existing.

Notarization requires the hardened runtime, and the hardened runtime is where the microphone dies silently: without `NSMicrophoneUsageDescription` in the Info.plist and the `com.apple.security.device.audio-input` entitlement, `getUserMedia` fails at the exact moment someone presses record. There is no build-time error for this. It only shows up when a human tries to sing.

**Windows is not signed initially.** SmartScreen warns and can be clicked through, which is a real but survivable cost; an OV certificate is a few hundred dollars a year for a first release nobody has installed yet. Document the click-through and revisit if people actually hit it.

**No auto-updater.** electron-updater is real machinery with real failure modes, and the honest v1 is a version check against the latest release that shows a quiet notice linking to the Releases page. Ship that; add updating later if the app earns it.

**Blocked by:** 05 (there has to be something to sign)

**Status:** ready-for-agent

- [ ] A GitHub Actions workflow builds Windows and macOS on a tag, with Linux AppImage included if it comes free
- [ ] macOS builds are signed and notarized, with credentials in repository secrets and never in the repo; a stapled DMG opens on a machine that has never seen the app
- [ ] `NSMicrophoneUsageDescription` and the audio-input entitlement are present, **verified by recording a Take in the notarized build** — the failure mode is silent and nothing else catches it
- [ ] Artifacts are published to GitHub Releases with checksums
- [ ] Windows builds are unsigned for now, and the SmartScreen click-through is written down for the README ticket to use
- [ ] The app checks the latest release on startup and shows an unobtrusive notice with a link when a newer one exists; no downloading, no installing, no auto-update
- [ ] A clean-machine install is done by hand per platform, at minimum: open the app, import a local file, record a Take, render a Mix, download it, separate a Track, import from YouTube, and restore a backup

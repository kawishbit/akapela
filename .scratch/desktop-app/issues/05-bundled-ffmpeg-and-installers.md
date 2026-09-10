# 05: Bundled ffmpeg and the installers

**What to build:** The packaged artifacts, and the binaries they must carry.

`ffmpeg` and `ffprobe` are load-bearing for every import and every Mix, so they ship inside the installer and are never expected on the user's machine. The Dockerfile already downloads static builds at image-build time and already picks the **gpl** variant deliberately — the `lgpl` variants have librubberband stripped out, and Rubber Band is the app's only pitch and tempo engine (ADR 0004). The same reasoning applies here, so the same variant ships.

A prepack step downloads them per target platform. Note that BtbN publishes Linux and Windows builds only; macOS static builds come from a different publisher. **Pin exact versions with checksums in a small manifest**, rather than following `latest` the way the Dockerfile does. That is acceptable for a self-hoster building an image on their own machine; it is not acceptable for a binary you sign and hand to other people.

The separation CLI ships **precompiled to JavaScript**. Today `separate-cli.ts` is run directly by Node 24's native type-stripping — do not bet the desktop build on Electron's Node having that enabled. It is three files (`separate-cli.ts`, `mdx-net.ts`, `stft.ts`) plus `app/audio/wav.ts`, so this is a small `tsc` invocation, not a build system. Its own `server/lib/separators/package.json` already scopes the dependency install to just what it imports, with its own lockfile — reuse that rather than inventing something.

Licences: the app is GPL-3.0-only already and is now distributing GPL binaries in an installer. Ship the licence texts and put a "source and licences" link in the app. That is the whole obligation — nothing more elaborate.

**Blocked by:** 02 (the tool seam), 03 (the `desktop/` package)

**Status:** ready-for-agent

- [ ] `desktop/scripts/fetch-binaries.ts` downloads ffmpeg and ffprobe for the target platform into a gitignored `desktop/vendor/<platform>-<arch>/`, verifying a checksum from a pinned manifest and failing loudly on a mismatch
- [ ] The gpl build variant is used, with a comment pointing at the Dockerfile's existing explanation of why the lgpl one is unusable here
- [ ] electron-builder is configured for Windows NSIS, macOS DMG, and a Linux AppImage, carrying the vendored binaries as `extraResources`
- [ ] The separation CLI and the three modules it imports are compiled to JavaScript at pack time and bundled with the `onnxruntime-node` prebuild for the target platform only — the Dockerfile's `ONNXRUNTIME_NODE_INSTALL=skip` and single-architecture pruning are the precedent for keeping this from ballooning
- [ ] `.output` is built and bundled; the migrations directory ships with it, since the database migrates itself on startup
- [ ] Electron main points `AKAPELA_FFMPEG`, `AKAPELA_FFPROBE`, and `AKAPELA_SEPARATE_CLI` at the bundled paths, resolved correctly from both a development run and inside a packaged app
- [ ] GPL-3.0 and the bundled binaries' licence texts ship in the installer, with a link in the app to the source and licences
- [ ] A locally built installer on Windows installs, opens, imports a local audio file, renders a Mix, and separates a Track — the full path through both bundled binaries and the ONNX subprocess
- [ ] The final installer size is recorded in this ticket's comments, so the cost of bundling is a known number rather than a guess

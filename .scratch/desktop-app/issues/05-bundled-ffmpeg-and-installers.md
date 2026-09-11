# 05: Bundled ffmpeg and the installers

**What to build:** The packaged artifacts, and the binaries they must carry.

`ffmpeg` and `ffprobe` are load-bearing for every import and every Mix, so they ship inside the installer and are never expected on the user's machine. The Dockerfile already downloads static builds at image-build time and already picks the **gpl** variant deliberately — the `lgpl` variants have librubberband stripped out, and Rubber Band is the app's only pitch and tempo engine (ADR 0004). The same reasoning applies here, so the same variant ships.

A prepack step downloads them per target platform. Note that BtbN publishes Linux and Windows builds only; macOS static builds come from a different publisher. **Pin exact versions with checksums in a small manifest**, rather than following `latest` the way the Dockerfile does. That is acceptable for a self-hoster building an image on their own machine; it is not acceptable for a binary you sign and hand to other people.

The separation CLI ships **precompiled to JavaScript**. Today `separate-cli.ts` is run directly by Node 24's native type-stripping — do not bet the desktop build on Electron's Node having that enabled. It is three files (`separate-cli.ts`, `mdx-net.ts`, `stft.ts`) plus `app/audio/wav.ts`, so this is a small `tsc` invocation, not a build system. Its own `server/lib/separators/package.json` already scopes the dependency install to just what it imports, with its own lockfile — reuse that rather than inventing something.

Licences: the app is GPL-3.0-only already and is now distributing GPL binaries in an installer. Ship the licence texts and put a "source and licences" link in the app. That is the whole obligation — nothing more elaborate.

**Blocked by:** 02 (the tool seam), 03 (the `desktop/` package)

**Status:** ready-for-human

- [x] `desktop/scripts/fetch-binaries.ts` downloads ffmpeg and ffprobe for the target platform into a gitignored `desktop/vendor/<platform>-<arch>/`, verifying a checksum from a pinned manifest and failing loudly on a mismatch
- [x] The gpl build variant is used, with a comment pointing at the Dockerfile's existing explanation of why the lgpl one is unusable here
- [x] electron-builder is configured for Windows NSIS, macOS DMG, and a Linux AppImage, carrying the vendored binaries as `extraResources`
- [x] The separation CLI and the three modules it imports are compiled to JavaScript at pack time and bundled with the `onnxruntime-node` prebuild for the target platform only — the Dockerfile's `ONNXRUNTIME_NODE_INSTALL=skip` and single-architecture pruning are the precedent for keeping this from ballooning
- [x] `.output` is built and bundled; the migrations directory ships with it, since the database migrates itself on startup
- [x] Electron main points `AKAPELA_FFMPEG`, `AKAPELA_FFPROBE`, and `AKAPELA_SEPARATE_CLI` at the bundled paths, resolved correctly from both a development run and inside a packaged app
- [x] GPL-3.0 and the bundled binaries' licence texts ship in the installer, with a link in the app to the source and licences
- [ ] A locally built installer on Windows installs, opens, imports a local audio file, renders a Mix, and separates a Track — the full path through both bundled binaries and the ONNX subprocess
- [ ] The final installer size is recorded in this ticket's comments, so the cost of bundling is a known number rather than a guess

## Comments

Built, and the fetch half is proven on a real download; the pack half has not been run because Electron's own binary had not finished downloading on this machine.

`desktop/scripts/fetch-binaries.ts` + `scripts/binaries.json`:

- One immutable build pinned per `<platform>-<arch>`, with the SHA-256 its archive must have, extracted into `desktop/vendor/<platform>-<arch>/`. Unpacked with `tar`, which reads both zip and tar.xz on every platform this targets, rather than adding a zip library for something the OS already does.
- **A mismatch fails, and so does an entry nobody has verified.** A null checksum is treated as an unverified pin, not a blank cheque: it refuses and says to re-run with `--record`, check what you got, and commit the result. Both refusal paths were exercised for real.
- Always the `gpl` variant, with a comment pointing at the Dockerfile's explanation of why `lgpl` is unusable. **Verified rather than assumed** on the build actually fetched: `ffmpeg -version` on the pinned `win64-gpl` build reports `--enable-gpl --enable-librubberband`, and `ffmpeg -filters` lists `rubberband  A->A  Apply time-stretching and pitch-shifting`.

Checksums recorded so far, all from real downloads on this machine:

| platform | source | sha256 |
| -------- | ------ | ------ |
| win32-x64 | BtbN `autobuild-2026-09-10-15-31`, win64-gpl | `079321…3535d` |
| linux-x64 | same release, linux64-gpl | `41e0b9…46a30` |
| darwin-x64 ffmpeg | evermeet.cx 9.0.1 | `8a8c9e…4a48f` |
| darwin-x64 ffprobe | evermeet.cx 9.0.1 | `d13f35…3b4f1` |

**`darwin-arm64` is unresolved, and the manifest says so rather than guessing.** BtbN publishes Linux and Windows only. evermeet.cx — whose 9.0.1 build does carry rubberband 4.0.0 — states outright on its own site that it will not publish native Apple Silicon builds. No other publisher was found that both ships an arm64 macOS ffmpeg *and* can be confirmed to compile librubberband in, and shipping one that does not would silently lose every Adjustment in every Mix rather than fail. So that entry has no URL and the fetch refuses it by name. **Apple Silicon is most Macs now, so this blocks the mac half of ticket 09 as much as the missing Developer account does.** Someone needs to find or build one and pin it.

Packaging (`electron-builder.yml`, `scripts/prepack.ts`): NSIS, DMG, and AppImage, with everything staged as `extraResources` outside the asar, because every path in it is either spawned as a process or read by one. The staged tree keeps `.output`'s own shape (`output/server/` beside `output/public/`) because `index.mjs` looks for `../public` next to itself. Migrations ship. The separation CLI is compiled with `tsc --rewriteRelativeImportExtensions`, which is what turns the explicit `.ts` specifiers Node's type-stripping requires into the `.js` ones an emitted tree needs; its own `server/lib/separators/package.json` and lockfile scope the install, with `ONNXRUNTIME_NODE_INSTALL=skip` and the same single-architecture pruning the Dockerfile does. Electron main points `AKAPELA_FFMPEG`, `AKAPELA_FFPROBE`, and `AKAPELA_SEPARATE_CLI` at `packagedLayout()` or `developmentLayout()` depending on `app.isPackaged`; both are pure functions, both covered in `tests/unit/desktop/layout.test.ts`.

Licences ship: `LICENSE` as `akapela-GPL-3.0.txt`, the ffmpeg GPL text, and `desktop/resources/licenses/README.md` saying what is under which. **Help › Source and Licences** opens the folder; **Help › Source Code** opens the repository.

**Two boxes unticked.**

- No installer has been built, so nothing has been installed, opened, imported, mixed, or separated from one.
- **No installer size figure, therefore.** One number is worth recording anyway, because it is larger than expected: the pinned `win64-gpl` build's `ffmpeg.exe` and `ffprobe.exe` are **164 MB each — 328 MB of binaries before Electron, the server, or onnxruntime**. These are BtbN's full static builds with every codec compiled in, for an app that only ever asks for `pcm_s16le`, `libmp3lame`, and the `rubberband` filter. The Dockerfile pays the same cost and shrugs; an installer someone downloads is a different audience. Worth a follow-up: a slimmer publisher, or a custom build with a narrow `--enable-` list.

**Addendum.** While verifying ticket 04, the separation CLI ran as **TypeScript** under Electron's own Node (24.20.0) — so type-stripping is enabled there after all. This ticket still compiles it to JavaScript for the installer and should keep doing so: the argument was never that it would fail, it was that a signed artifact handed to other people should not depend on a default that Electron is free to change. Nothing to do; recorded so the next reader does not re-litigate it.

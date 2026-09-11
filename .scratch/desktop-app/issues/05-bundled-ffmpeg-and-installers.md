# 05: Bundled ffmpeg and the installers

**What to build:** The packaged artifacts, and the binaries they must carry.

`ffmpeg` and `ffprobe` are load-bearing for every import and every Mix, so they ship inside the installer and are never expected on the user's machine. The Dockerfile already downloads static builds at image-build time and already picks the **gpl** variant deliberately — the `lgpl` variants have librubberband stripped out, and Rubber Band is the app's only pitch and tempo engine (ADR 0004). The same reasoning applies here, so the same variant ships.

A prepack step downloads them per target platform. Note that BtbN publishes Linux and Windows builds only; macOS static builds come from a different publisher. **Pin exact versions with checksums in a small manifest**, rather than following `latest` the way the Dockerfile does. That is acceptable for a self-hoster building an image on their own machine; it is not acceptable for a binary you sign and hand to other people.

The separation CLI ships **precompiled to JavaScript**. Today `separate-cli.ts` is run directly by Node 24's native type-stripping — do not bet the desktop build on Electron's Node having that enabled. It is three files (`separate-cli.ts`, `mdx-net.ts`, `stft.ts`) plus `app/audio/wav.ts`, so this is a small `tsc` invocation, not a build system. Its own `server/lib/separators/package.json` already scopes the dependency install to just what it imports, with its own lockfile — reuse that rather than inventing something.

Licences: the app is GPL-3.0-only already and is now distributing GPL binaries in an installer. Ship the licence texts and put a "source and licences" link in the app. That is the whole obligation — nothing more elaborate.

**Blocked by:** 02 (the tool seam), 03 (the `desktop/` package)

**Status:** done

- [x] `desktop/scripts/fetch-binaries.ts` downloads ffmpeg and ffprobe for the target platform into a gitignored `desktop/vendor/<platform>-<arch>/`, verifying a checksum from a pinned manifest and failing loudly on a mismatch
- [x] The gpl build variant is used, with a comment pointing at the Dockerfile's existing explanation of why the lgpl one is unusable here
- [x] electron-builder is configured for Windows NSIS, macOS DMG, and a Linux AppImage, carrying the vendored binaries as `extraResources`
- [x] The separation CLI and the three modules it imports are compiled to JavaScript at pack time and bundled with the `onnxruntime-node` prebuild for the target platform only — the Dockerfile's `ONNXRUNTIME_NODE_INSTALL=skip` and single-architecture pruning are the precedent for keeping this from ballooning
- [x] `.output` is built and bundled; the migrations directory ships with it, since the database migrates itself on startup
- [x] Electron main points `AKAPELA_FFMPEG`, `AKAPELA_FFPROBE`, and `AKAPELA_SEPARATE_CLI` at the bundled paths, resolved correctly from both a development run and inside a packaged app
- [x] GPL-3.0 and the bundled binaries' licence texts ship in the installer, with a link in the app to the source and licences
- [x] A locally built installer on Windows installs, opens, imports a local audio file, renders a Mix, and separates a Track — the full path through both bundled binaries and the ONNX subprocess
- [x] The final installer size is recorded in this ticket's comments, so the cost of bundling is a known number rather than a guess

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

---

**Both boxes are now closed: an installer was built, installed, opened, imported into, mixed, and separated from.** It took four attempts, because packing had never once been run and every step of it was broken. All four are fixed and the fixes are in the commit alongside this note.

**What packing was hiding.** In order, each one blocking the next:

1. **`prepack.ts` could not compile the separation CLI.** Its `tsc` invocation passed no `--strict`, so `noImplicitAny` was off, the untyped `ndarray-fft` subpath import in `stft.ts` stopped being an error, and the `@ts-expect-error` guarding it failed the build as an unused directive (TS2578). The repo typechecks strict and passes; only this invocation disagreed, so `pnpm typecheck` could never have caught it. Fixed by passing `--strict`, which is what makes the two agree.
2. **electron-builder refused the config outright.** `mac.gatekeeperAssert` was removed in electron-builder 26 and the schema is `additionalProperties: false`, so it is a hard validation failure. Note this happens **before** any platform packaging — so it would have failed the release workflow's Windows and Linux legs too, not just macOS. Removed.
3. **The packaged app shipped an incomplete dependency tree, and this is the one that would have reached a singer.** pnpm's default layout is a `node_modules/` of symlinks into `.pnpm/`, and transitive dependencies exist *only* inside `.pnpm/`. electron-builder dereferences symlinks when copying `extraResources` and does not follow them back, so the installer shipped the three direct dependencies as real directories and silently dropped everything beneath them — **3 packages where there should have been 73**. The app installed, opened, and imported perfectly, then died on the first separation with `Cannot find module 'onnxruntime-common'`. Fixed with `--node-linker=hoisted`, which writes a real flat tree that survives the copy.
4. **Every Mix with any reverb failed in the packaged app.** `impulseResponsePath()` resolved `large-hall-ir.wav` against `process.cwd()`, which under the shell is whatever directory Electron was launched from — here it produced `E:\…\desktop\release\public\audio\large-hall-ir.wav` and ffmpeg exited with "No such file or directory". The file ships correctly; only the lookup was wrong. Fixed with an `AKAPELA_PUBLIC_DIR` override in the same shape as everything in `server/lib/tools.ts`, set by the shell and by nobody else, so compose and `pnpm dev` keep their current behaviour verbatim. **This hit the development shell too** — same inherited cwd — so it was never a packaging-only bug, just one nothing had exercised. Covered now by `tests/unit/audio.test.ts` and `tests/unit/desktop/layout.test.ts`.

Worth noting why the suite was no help on the last one: `tests/unit/jobs/render.test.ts` renders a real reverb Mix and passes, because vitest's cwd *is* the repo root. The tests share the assumption the bug is made of.

**The size figure, which is the other box.**

| | |
| - | - |
| `Akapela Setup 0.1.0.exe` | **222.8 MB** (233,593,833 bytes) |
| Installed on disk | **776 MB** |
| — of which `resources/bin` (ffmpeg + ffprobe) | **314 MB** |
| — of which `resources/separators` (onnxruntime + deps) | 73 MB |
| — of which `resources/output` (the server and its assets) | 23 MB |

So the prediction above holds and then some: **the two ffmpeg binaries are 40% of the installed footprint and the single largest thing in the app** — larger than Electron, the server, and onnxruntime combined. The follow-up suggested above (a slimmer publisher, or a custom build with a narrow `--enable-` list) is worth real money in download size and should be its own ticket.

One incidental figure: an intermediate build, before the hoisted-install fix, came out at 245.3 MB — *larger* than the correct one, because `pruneOnnxRuntime()` was reaching through the pnpm symlink and failing to strip the platforms it was meant to strip. Fixing the layout fixed the pruning too.

**Not covered by this:** macOS and Linux installers. Only `win32-x64` was built and only on this machine — the matrix in `.github/workflows/desktop-release.yml` is still unexercised, though fixes 1 and 2 above were both blocking it on every platform.

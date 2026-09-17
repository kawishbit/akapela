# 05: A slimmer bundled ffmpeg

**What to build:** A noticeably smaller installer download, with nothing a singer does getting worse. Each installer currently carries full ffmpeg builds, and on Windows `ffmpeg` and `ffprobe` are 164 MB *each*. The app only ever needs to:
- decode uploads (mp3, m4a, wav, flac, ogg) and the AAC/Opus audio yt-dlp downloads,
- read durations,
- encode WAV and MP3,
- run the reverb, low-pass, and mixing filters.

Once Rubber Band is out of ffmpeg (ticket 01), none of that needs GPL-only external libraries. Two routes, not mutually exclusive: stop shipping `ffprobe` by reading durations another way, or pin slimmer builds.

**Blocked by:** 02

**Status:** ready-for-human

- [x] The installer for each platform is measurably smaller than before, with the before and after sizes recorded
- [ ] Every upload format, a YouTube import, an Adjusted Mix render, and the MP3 export all still work on every platform
- [x] Whatever is dropped or swapped is still pinned by checksum, and the licence notes match what now ships

## Comments

**Route taken: stop shipping ffprobe.** Swapping builds was not taken. The app ran ffprobe for one thing: the duration of a WAV it had just written. That is either the Backing Track after import, or the Backing Track or Stem before a render. `wavDurationMs` in `server/lib/audio.ts` now reads the duration from the WAV header, as the data chunk size divided by the byte rate. Only chunk headers are read. A test holds it to ffprobe's answer on an odd-length mono 22.05 kHz file. ffprobe is gone from:
- `server/lib/tools.ts` (`AKAPELA_FFPROBE`; `ffmpegToolPath(tool)` became `ffmpegPath()`);
- the desktop layout and shell;
- the extracted members in `binaries.json`, and the macOS fetch, which now takes only `ffmpeg.zip`;
- the Dockerfile and the AppHost prerequisites;
- the macOS check step in the workflow;
- README, AGENTS.md, and the licence notes.

ADR 0010 gains an amendment. The test suite still uses ffprobe to inspect what the app wrote.

`fetch-binaries.ts` now empties `vendor/<platform>-<arch>/` before it extracts. Without that, a machine that had fetched ffprobe earlier would keep staging it into the installer. That happened here on the first measurement attempt.

**Why not slimmer builds.** Sizes of BtbN's `autobuild-2026-09-10-15-31` archives:

| | win64 | linux64 |
|---|---|---|
| gpl static | 185 MB | 144 MB |
| lgpl static | 164 MB | 131 MB |
| gpl shared | 82 MB | 65 MB |
| lgpl shared | 73 MB | 60 MB |

`lgpl` saves about 10%. A shared build's libraries total roughly what one static ffmpeg does, which is about what dropping ffprobe already saves. Either swap would have needed every format re-verified on every platform for a small extra saving.

**Sizes.** Measured on Windows by packing the same `staging/` twice, once with `bin/ffprobe.exe` added back:

| installer | with ffprobe | without | change |
|---|---|---|---|
| Windows NSIS (`Akapela Setup 1.0.1.exe`) | 233,683,701 B (222.9 MiB) | 187,919,009 B (179.2 MiB) | −45.8 MB, −19.6% |

Not yet measured: the Linux AppImage and the macOS DMG. They drop a 164 MB (linux64) and a 66 MB (macOS) uncompressed ffprobe respectively. Their real installer sizes come from the next dry run's artifacts. Record them here then; the matching "with ffprobe" figure is the previous dry run's artifact.

**Still works.**
- New import tests: mp3, m4a/AAC, wav, flac, ogg/Vorbis, and webm/Opus uploads each import, with the right duration.
- The render tests cover adjusted Mixes and MP3 encoding.
- Full suite: 775 passed.
- These ran against the development machine's ffmpeg, not the pinned builds. The Windows and Linux pins are the same archives as before. The macOS build's decoders and libmp3lame were checked in ticket 02, but only statically.
- No installer was opened. Running a YouTube import and a Mix on each platform is part of ticket 04's per-platform check.

Status stays `ready-for-agent` until the Linux and macOS installer sizes are recorded from the dry run.

**Installer sizes from the dry run** ([run 35132941183](https://github.com/kawishbit/akapela/actions/runs/35132941183)):

| installer | with ffprobe | without | change |
|---|---|---|---|
| Windows NSIS | 233,683,701 B (local pack of identical staging) | 187,918,981 B | −45.8 MB, −19.6% |
| Linux AppImage | 471,594,169 B (dry run 35128137128, at `59cc62b`) | 402,927,134 B | −68.7 MB, −14.6% |
| macOS arm64 DMG | none: no macOS installer was ever built with ffprobe | 193,045,612 B | 66 MB of uncompressed ffprobe never shipped |

The CI Windows installer (187,918,981 B) is within 28 bytes of the local pack without ffprobe, which confirms that measurement.

The Linux AppImage is still twice the size of the other two. That is not ffmpeg. It is worth its own look.

Status is `ready-for-human`. The remaining box, every format, a YouTube import, and an Adjusted Mix working in each installer, can only be checked by opening them. That is ticket 04's per-platform check, and this box closes with it.

**Why the AppImage was twice the size.** It was not ffmpeg. The v1.0.2 AppImage and DMG were unpacked and every file was compressed the way each format does it. The model came within 1% of the real AppImage and 2% of the DMG. Of the AppImage's 384 MiB:
- **About 171 MiB was `libonnxruntime_providers_cuda.so`.** onnxruntime-node's postinstall downloads it from NuGet, on linux/x64 only, alongside the TensorRT and shared provider libraries. The separation session only ever asks for the CPU provider. `prepack.ts` had a comment saying `ONNXRUNTIME_NODE_INSTALL=skip` prevented this, but it never passed the variable to the install. The Dockerfile does pass it.
- **About 40 MiB was compression.** With no setting, the AppImage is squashfs gzip in 128 KB blocks. NSIS puts the app in one LZMA 7z instead.

Changes on `fix/desktop-installer-size`:
- `prepack.ts` passes `ONNXRUNTIME_NODE_INSTALL=skip` to the install.
- `pruneOnnxRuntime` now fails the build if any `onnxruntime_providers_*` library is staged.
- `pruneOnnxRuntime` also drops macOS's `libonnxruntime.1.29.0.dylib`. It is a second full 44 MB copy of `libonnxruntime.1.dylib`, and nothing loads it: the binding and the dylib's own install name both refer to `@rpath/libonnxruntime.1.dylib`.
- `electron-builder.yml` sets `appImage.compression: xz`. It is not the root `compression: maximum`, which would also change the DMG and NSIS.

Linux build of that branch, run in `node:24-bookworm` Docker with the same steps as the release workflow:

| installer | before (v1.0.2) | after | change |
|---|---|---|---|
| Linux AppImage | 402,927,079 B (384.3 MiB) | 176,160,404 B (168.0 MiB) | −56% |
| macOS arm64 DMG | 193,045,585 B (184.1 MiB) | not built; ≈172 MiB expected (the duplicate dylib is ≈12 MiB zlib-compressed) | |
| Windows NSIS | 187,918,970 B (179.2 MiB) | unchanged; none of these changes reach it | |

Checked on the built AppImage:
- The squashfs is XZ with 1 MB blocks.
- The staged `linux/x64` holds only `libonnxruntime.so.1` and the binding.
- `onnxruntime-node` imports and creates a tensor from the extracted tree.

Not yet checked:
- A real separation run in the installed AppImage.
- The macOS dylib removal on a Mac. That needs the next dry run's DMG, opened.
- How much slower an xz AppImage takes to launch.

Left alone: Windows ships onnxruntime's `DirectML.dll`, `dxcompiler.dll`, and `dxil.dll` (≈14 MiB compressed). No one has checked whether `onnxruntime.dll` loads without them.

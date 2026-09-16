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

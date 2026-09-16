# Spec: Apple Silicon in the release, and the first release that ships it

Status: ready-for-agent

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Mix render stretches with Rubber Band WebAssembly](issues/01-mix-render-stretches-with-rubber-band-wasm.md) | done | — |
| 02 | [The Apple Silicon installer bundles a pinned off-the-shelf ffmpeg](issues/02-apple-silicon-bundles-pinned-ffmpeg.md) | done | 01 |
| 03 | [A dry run builds all three installers, and the pipeline fixes land](issues/03-dry-run-builds-all-three-installers.md) | ready-for-human (dry run and merge left) | 02 |
| 04 | [Cut v1.0.2 end to end](issues/04-cut-v1-0-2-end-to-end.md) | ready-for-human | 03 |
| 05 | [A slimmer bundled ffmpeg](issues/05-slimmer-bundled-ffmpeg.md) | ready-for-agent | 02 |

## Problem Statement

The release workflow has never produced a full release. Fixing it one live failure at a time exposed the build job itself, which had never run. Dry runs have since got Windows and Linux producing installers. macOS is the last platform, and it is stuck on ffmpeg.

macOS means Apple Silicon only; there is no Intel build. No publisher ships a static arm64 macOS ffmpeg with librubberband: evermeet.cx is Intel-only, and martin-riedl.de and osxexperts.net leave rubberband out. Compiling one from source works in principle, but it fails on toolchain quirks (Rubber Band 4.0.0 does not compile under Xcode 26's libc++ without a workaround). It would also be a permanent, Mac-only build to maintain.

## Solution

Rubber Band is used in exactly two places:
- **Live playback**, in the browser, via Rubber Band compiled to WebAssembly. This needs no ffmpeg.
- **The final Mix render**, on the server, via ffmpeg's `rubberband` filter. This filter is in every Mix's graph, even with no Adjustments, so an ffmpeg without it fails *every* render, not just adjusted ones. It is the only reason any platform needs an ffmpeg with librubberband.

Move the render's stretch out of ffmpeg and onto the same Rubber Band WebAssembly build the live preview already uses. Rubber Band's WebAssembly build was confirmed to load and run under plain Node. Then every platform, Apple Silicon included, can bundle a stock, checksum-pinned static ffmpeg, and the from-source macOS build goes away. The exported Mix also matches the preview more closely than it does today, since both run the same Rubber Band build.

## Decisions

Settled in conversation, with the reasoning worth keeping:

- **Keep ffmpeg.** It decodes every upload format (mp3, m4a, wav, flac, ogg) and the AAC/Opus audio yt-dlp downloads with `-f bestaudio`, encodes the MP3 export, and runs the reverb and mixing. Nothing lighter covers AAC as well: `ffmpeg.wasm` is larger and slower, and the pure-JS decoders don't handle AAC properly.
- **Keep Rubber Band; move it, don't replace it.** Signalsmith Stretch (MIT, header-only, has an official WebAssembly build) was considered. It would change how Adjustments sound and reopen ADR 0004's quality decision, without making the Mac problem any easier than moving Rubber Band does.
- **No Intel macOS build.** macOS means Apple Silicon for this app.
- **Signing stays out of scope.** An unsigned Apple Silicon app downloaded from the internet is refused as "damaged" until its quarantine flag is cleared; that gets documented, not solved, until there is an Apple Developer account.

# 02: The Apple Silicon installer bundles a pinned off-the-shelf ffmpeg

**What to build:** The macOS leg of the release workflow downloads a static arm64 `ffmpeg` and `ffprobe` from a publisher, pinned by version and SHA-256, the same way Windows and Linux already do. The from-source macOS ffmpeg build, which was stuck on Rubber Band not compiling under Xcode 26, is removed, along with its cache and build tools.

There is no Intel macOS build anywhere. macOS means Apple Silicon only.

**Blocked by:** 01 (until the render stops using ffmpeg's `rubberband` filter, a stock arm64 ffmpeg fails every Mix render)

**Status:** done

- [x] The darwin-arm64 pin names an immutable, versioned arm64 build with its SHA-256; a checksum mismatch fails the fetch, as for the other platforms
- [x] The pinned build is checked rather than assumed: it is arm64-only, runs without any library outside macOS itself, and has the libmp3lame encoder the MP3 export needs
- [x] The from-source build script, the "built, not downloaded" path in the fetch, and the workflow's macOS cache and build-tool steps are gone
- [x] No darwin-x64 entry or Intel runner remains in the fetch manifest, the electron-builder config, or the release workflow
- [x] The bundled licence notes name where the macOS ffmpeg now comes from and its licence
- [x] The desktop-app ticket that left darwin-arm64 unresolved records how it was resolved

## Comments

**Done.** `darwin-arm64` in `desktop/scripts/binaries.json` is martin-riedl.de's 9.0.1 release build, `https://ffmpeg.martin-riedl.de/download/macos/arm64/1787073674_9.0.1/{ffmpeg,ffprobe}.zip`. The path is versioned and timestamped, and each archive has its own pinned SHA-256. They use the existing `zip-per-binary` shape, so a checksum mismatch fails the fetch through the same `verify()` as the other platforms. Cross-fetching it from Windows (`pnpm fetch-binaries -- --platform darwin --arch arm64`) passed both checksums.

Checked on the downloaded binaries, by reading their Mach-O headers and load commands:
- both are thin arm64, not universal;
- every library they load is under `/usr/lib` or `/System/Library`;
- the configuration string carries `--enable-gpl --enable-version3 --enable-libmp3lame`;
- the publisher's `codecs.txt` lists the libmp3lame encoder and the aac/mp3/flac/opus/vorbis decoders.

The workflow's macOS leg re-asserts the first three on the runner (`lipo -archs`, `otool -L`, `ffmpeg -encoders`) before building. Not yet run on a Mac; that happens in ticket 03's dry run.

Removed: `scripts/build-ffmpeg-darwin-arm64.sh`, the `build` archive type and its branch in `fetch-binaries.ts`, and the workflow's ffmpeg cache and `brew install meson ninja pkgconf` steps. No darwin-x64 entry or Intel runner remains. The licence README names both publishers. ADR 0010's "always the gpl variant" consequence is rewritten, and desktop-app ticket 05 records how darwin-arm64 was resolved.

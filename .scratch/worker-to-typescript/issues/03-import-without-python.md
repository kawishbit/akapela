# 03: Importing from YouTube or an upload works without Python

**What to build:** From the outside, importing a Track — pasting a YouTube URL or uploading a file — behaves exactly as it does today: the card fills in with title and artwork, then a normalized Backing Track appears, all without the Python worker touching this Job type. Internally, source fetching is ported to shell out to the standalone yt-dlp binary rather than using it as a Python library, and audio normalization is ported to a TS ffmpeg wrapper, both running inside the in-process runner from ticket 02.

**Blocked by:** 02 (in-process job runner)

**Status:** done

- [x] Importing a YouTube URL produces a Track with title, duration, cover art, and a normalized 44.1kHz stereo WAV Backing Track (ADR 0005), with the import Job run by the in-process TS runner
- [x] Importing an uploaded file produces the same, skipping metadata/artwork fetch as today
- [x] Errors surfaced on the card (an unreachable video, an unsupported upload, a broken yt-dlp binary) read the same way they do today
- [~] The yt-dlp binary is resolved per-OS in every environment this runs in (Docker image, Aspire dev), the same way ffmpeg already is — see note below
- [x] Existing import tests are ported and pass against the new implementation

## Result

`server/lib/sources.ts` ports `sources.py`'s `YtDlpFetcher`: `-J --no-playlist`
for metadata, `--newline` progress parsing for the download, both via
`child_process.spawn('yt-dlp', ...)`. 11 tests in
`tests/unit/jobs/import-track.test.ts` port both `test_import.py` (upload)
and `test_import_youtube.py` (fake fetcher) against real ffmpeg.

**The "resolved per-OS" criterion is only partly met.** The implementation
`spawn`s `yt-dlp` by name off `PATH`, exactly the assumption `audio.ts`
already makes for `ffmpeg` — it does not download or select a per-OS binary
itself. That matches the existing ffmpeg pattern (a documented prerequisite,
installed by `apt-get` in the Dockerfile / by hand in dev) rather than
active OS detection, but it means yt-dlp needs to actually be added as an
install step in the app's Dockerfile now that the app runs import Jobs —
today it's only in `worker/Dockerfile`, which ticket 07 deletes. Added to
ticket 07's checklist rather than left implicit.

Verified end-to-end against the real yt-dlp binary and real network on a
live dev server (not just fakes): a YouTube URL producing a ready Track with
correct title, thumbnail, duration, and a normalized Backing Track.

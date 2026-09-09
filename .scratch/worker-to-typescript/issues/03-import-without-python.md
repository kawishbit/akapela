# 03: Importing from YouTube or an upload works without Python

**What to build:** From the outside, importing a Track — pasting a YouTube URL or uploading a file — behaves exactly as it does today: the card fills in with title and artwork, then a normalized Backing Track appears, all without the Python worker touching this Job type. Internally, source fetching is ported to shell out to the standalone yt-dlp binary rather than using it as a Python library, and audio normalization is ported to a TS ffmpeg wrapper, both running inside the in-process runner from ticket 02.

**Blocked by:** 02 (in-process job runner)

**Status:** ready-for-agent

- [ ] Importing a YouTube URL produces a Track with title, duration, cover art, and a normalized 44.1kHz stereo WAV Backing Track (ADR 0005), with the import Job run by the in-process TS runner
- [ ] Importing an uploaded file produces the same, skipping metadata/artwork fetch as today
- [ ] Errors surfaced on the card (an unreachable video, an unsupported upload, a broken yt-dlp binary) read the same way they do today
- [ ] The yt-dlp binary is resolved per-OS in every environment this runs in (Docker image, Aspire dev), the same way ffmpeg already is
- [ ] Existing import tests are ported and pass against the new implementation

# 06: Audio Format: FLAC

**What to build:** The **Audio Format** setting, with WAV and FLAC (ADR 0016).

- Settings gains a **Storage** section with **Audio Format**: WAV (default) or FLAC, described as "lossless, about half the size".
- The Backing Track master written at import and the Stems written by a Separation use the format in force **when that file is written**. Takes, Mixes, and the original audio are untouched.
- Every reader of a master or Stem accepts whatever format the file actually is: the audio routes the browser fetches (with the right `Content-Type`), the Separation's input, the render pipeline, and the stretch. Nothing assumes `.wav`.
- Durations are read from the FLAC `STREAMINFO` block the way they're read from WAV headers now. Never ffprobe.
- A library with both formats works: existing WAV Tracks play, separate, and mix exactly as before.
- Backup and restore carry the files as they are.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] Audio Format is a setting, WAV when never set
- [ ] With FLAC chosen, a new import's master and a new Separation's Stems are FLAC
- [ ] Existing WAV Tracks are untouched and still work end to end
- [ ] Duration from `STREAMINFO` matches the WAV-derived duration of the same audio in a test
- [ ] A Mix rendered from FLAC Stems matches one rendered from WAV Stems sample for sample
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

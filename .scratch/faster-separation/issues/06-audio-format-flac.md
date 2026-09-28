# 06: Audio Format: FLAC

**What to build:** The **Audio Format** setting, with WAV and FLAC (ADR 0016).

- Settings gains a **Storage** section with **Audio Format**: WAV (default) or FLAC, described as "lossless, about half the size".
- The Backing Track master written at import and the Stems written by a Separation use the format in force **when that file is written**. Takes, Mixes, and the original audio are untouched.
- Every reader of a master or Stem accepts whatever format the file actually is: the audio routes the browser fetches (with the right `Content-Type`), the Separation's input, the render pipeline, and the stretch. Nothing assumes `.wav`.
- Durations are read from the FLAC `STREAMINFO` block the way they're read from WAV headers now. Never ffprobe.
- A library with both formats works: existing WAV Tracks play, separate, and mix exactly as before.
- Backup and restore carry the files as they are.

**Blocked by:** —

**Status:** done

- [x] Audio Format is a setting, WAV when never set
- [x] With FLAC chosen, a new import's master and a new Separation's Stems are FLAC
- [x] Existing WAV Tracks are untouched and still work end to end
- [x] Duration from `STREAMINFO` matches the WAV-derived duration of the same audio in a test
- [x] A Mix rendered from FLAC Stems matches one rendered from WAV Stems sample for sample
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29: Stored audio is now found by basename (`backing`, `instrumental`, `vocals`) plus whichever extension is on disk (`server/lib/audio-files.ts`), so nothing assumes `.wav`. A writer in one format removes any file with the same basename in another, so a Track never holds two masters. The two readers that only take WAV, the separation and stretch subprocesses, get a WAV decoded for them by ffmpeg. ffmpeg itself reads everything as it is. Stems are 16-bit, which FLAC stores exactly, so a Mix rendered from FLAC Stems is byte-identical to one rendered from WAV Stems, with or without a stretch (`tests/unit/jobs/render.test.ts`). Durations come from `STREAMINFO`'s total samples over its sample rate (`flacDurationMs`). The format is read when each file is written, the same way ticket 01 reads the core limit when a Separation starts.

# 07: Audio Format: MP3

**What to build:** MP3 as a third Audio Format, but only once it's proven not to shift timing (ADR 0016).

- **The alignment test comes first.** Encode a reference master and its Stems as MP3 320 CBR with a LAME/Xing header. Decode them the way the render pipeline does (ffmpeg) and check the sample offset against the source WAV is 0. Do the same in the browser (`decodeAudioData`, in the test harness's Chromium) if the harness can. A browser engine that can't be tested is named in this ticket's Comments.
- Only after that passes: MP3 joins the **Audio Format** choice, always 320 kbps CBR, described as "smallest, lossy".
- Duration is read from the Xing/LAME frame, with the encoder delay and padding subtracted. Never ffprobe.

**Blocked by:** 06

**Status:** done

- [x] The alignment test exists and passes before MP3 appears in Settings
- [x] With MP3 chosen, a new master and new Stems are MP3 320 CBR
- [x] Duration from the Xing/LAME frame equals the source's sample count
- [x] A Take recorded over an MP3 Backing Track lines up as it would over the WAV
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29, the alignment gate: a 3.217 s chirp was stored as MP3 by `storeWavAs` (ffmpeg `libmp3lame -b:a 320k`, which writes an Info frame and a LAME tag with the encoder delay and padding). ffmpeg decodes it to exactly the source's sample count, with a cross-correlation peak at lag 0 (`tests/unit/mp3-alignment.test.ts`). Checked by hand in the browser on a 7.3 s music clip (321,930 samples; 576 delay, 1,206 padding), decoded with `decodeAudioData` in an `OfflineAudioContext`:
  - **Chrome 154 on Windows:** 321,930 samples, lag 0.
  - **Firefox and Safari:** not tested. There's no browser harness in this repo (ADR 0009), and only Chrome was available on the machine. Safari is the one to check first, since its decoder is Apple's rather than FFmpeg's.
- Duration comes from the Info frame's frame count × 1152, minus the LAME tag's delay and padding. That equals the source's sample count exactly (`mp3DurationMs`). A file without an Info frame is refused, not estimated.
- A Mix rendered over an MP3 Instrumental Stem places the Take exactly as over the WAV: with the backing muted, the two are byte-identical. With the Take muted, the MP3 backing's cross-correlation with the WAV one peaks at lag 0 (`tests/unit/jobs/render.test.ts`).

# 07: Audio Format: MP3

**What to build:** MP3 as a third Audio Format, but only once it's proven not to shift timing (ADR 0016).

- **The alignment test comes first.** Encode a reference master and its Stems as MP3 320 CBR with a LAME/Xing header. Decode them the way the render pipeline does (ffmpeg) and check the sample offset against the source WAV is 0. Do the same in the browser (`decodeAudioData`, in the test harness's Chromium) if the harness can. A browser engine that can't be tested is named in this ticket's Comments.
- Only after that passes: MP3 joins the **Audio Format** choice, always 320 kbps CBR, described as "smallest, lossy".
- Duration is read from the Xing/LAME frame, with the encoder delay and padding subtracted. Never ffprobe.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The alignment test exists and passes before MP3 appears in Settings
- [ ] With MP3 chosen, a new master and new Stems are MP3 320 CBR
- [ ] Duration from the Xing/LAME frame equals the source's sample count
- [ ] A Take recorded over an MP3 Backing Track lines up as it would over the WAV
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

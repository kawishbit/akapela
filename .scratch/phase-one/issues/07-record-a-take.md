# 07: Record a Take

**What to build:** On the Sing page a singer grants microphone access, picks an input device, and presses record. A three-second countdown runs, the Backing Track starts from the current position, and the singer sings on the Lyrics screen with the Adjustments values visible and a level meter showing the mic is live. Stopping keeps what was recorded. The Take is captured as raw PCM through an AudioWorklet, encoded to WAV in the browser, and uploaded automatically with progress and a confirmation. Echo cancellation, noise suppression, and auto gain are off by default with a toggle. A Monitoring toggle, off by default, plays the voice back in headphones while recording. Takes are listed on the Track page with date, duration, and start position, and can be deleted.

**Blocked by:** 05 (Song identification and Lyrics screen via LRCLIB)

**Status:** done

- [x] The Take table exists with Track id, start position, duration, file path, Adjustments at record time, latency nudge, vocal gain, backing gain, and timestamps; Takes are stored as WAV under the Track directory
- [x] The Sing page requests microphone permission once, lists input devices, and remembers the chosen device per browser
- [x] Microphone constraints default to echo cancellation, noise suppression, and auto gain all off, with a toggle that turns them on
- [x] A Monitoring toggle, off by default, routes the microphone to the output with no processing
- [x] Pressing record runs a three-second countdown, then starts the Backing Track from the current position and begins capture; the Take's start position is that song position
- [x] An AudioWorklet captures raw PCM at the context sample rate, a level meter shows input during recording, and stopping at any point keeps the audio so far
- [x] The captured PCM is encoded to WAV in the browser by a pure encoder covered by Vitest for header fields, sample count, and round trip
- [x] The Take uploads automatically on stop with progress and a confirmation, carrying start position, duration, and the Adjustments in force
- [x] The Track detail page lists Takes with date, duration, and start position, and each can be deleted individually
- [x] API tests cover Take upload with metadata, listing, and deletion removing the file
- [x] The countdown, capture, Monitoring, and alignment of the recorded audio to the Backing Track are verified manually on a laptop and a phone

## Comments

Implemented. Every checklist item is done except the last: manual verification on real hardware (mic permission, countdown/capture timing, Monitoring, and alignment by ear) needs a human with an actual microphone — not something an agent in this environment can do. Automated coverage: `tests/unit/wav.test.ts` (WAV encoder) and `tests/api/takes.test.ts` (upload/list/delete) pass, `pnpm typecheck` and `pnpm lint` are clean.

**2026-09-07, maintainer.** The manual pass is done: microphone permission granted on real hardware, then the countdown, capture, Monitoring, and alignment of the recording to the Backing Track checked by ear on a laptop and a phone. That was the last open box, so the ticket is `done` at 11/11.

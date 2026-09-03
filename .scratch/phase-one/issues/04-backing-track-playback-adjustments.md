# 04: Backing Track playback with live Adjustments

**What to build:** A singer opens a Track and plays its Backing Track from a persistent bottom player bar with play, pause, seek, and elapsed and remaining time. Pitch and tempo controls change the sound immediately while the song keeps playing: pitch from minus twelve to plus twelve semitones, tempo from fifty to one hundred fifty percent, independent by default with a link toggle for the turntable feel, and a reset. The current values are always visible. The last Adjustments used on a Track are remembered.

**Blocked by:** 02 (Import an uploaded file as a Track)

**Status:** done

- [x] The Backing Track WAV is served with HTTP range support and fetched and decoded once in the browser into an AudioBuffer
- [x] Playback runs through a Rubber Band WebAssembly node applying pitch and tempo in real time; changing either updates the node without restarting playback
- [x] Adjustments are a plain parameter object (pitch semitones integer, tempo percent integer, linked boolean) validated on the API and shared with the browser engine
- [x] The player bar shows play, pause, a seek bar, elapsed and remaining time in song time, and the Track's cover and title, and persists across the library and Track detail pages
- [x] Pitch and tempo controls, a link toggle, a reset button, and the current values are shown on the Track detail page and are usable with a thumb on a phone
- [x] The last Adjustments are saved to the Track on change and restored when the Track is opened again
- [x] Reported position accounts for tempo, so the seek bar and times show song time rather than wall time
- [x] API tests cover range requests on the Backing Track and Adjustments validation and persistence
- [x] Vitest covers the Adjustments validation and the tempo-to-song-time position mapping
- [ ] The Web Audio graph is verified manually on a laptop and a phone, including pitch changes mid-playback with no dropouts

## Comments

**2026-09-04, agent.** Implemented.

- Rubber Band runs in the browser via the `rubberband-wasm` package (Rubber Band 3.3.0, GPL-2.0-or-later, compatible with the project's GPL-3.0). The AudioWorklet processor lives at `public/audio/rubberband-processor.js` because worklet modules load by URL and cannot be bundled; it owns the decoded PCM and pulls it at the tempo-scaled rate, so slowing down and speeding up both work without a growing buffer and the position it reports is song time. Main-thread side: `app/audio/engine.ts`, player state in `app/composables/usePlayer.ts`.
- Linked semantics: when `linked` is true the tempo drives pitch exactly like a turntable (pitch scale = tempo ratio) and the stored `pitchSemitones` is ignored but preserved, so unlinking restores it. The pitch control is disabled while linked and shows the derived, fractional value. `shared/adjustments.ts` holds the shape, validation, and the arithmetic both engines use; the worker's render step (ticket 09) should call the same rule.
- Adjustments are stored as a JSON column on the Track and saved 300 ms after the last change with `PUT /api/tracks/:id/adjustments`.
- Range requests on the Backing Track were already served and tested in ticket 02; those tests stand.
- Verified on a laptop in Chrome by tapping the graph with an analyser: real signal at every setting, song time advanced at 1.000, 0.503, and 1.492 song-seconds per second at 100, 50, and 150 percent, spectral centroid rose from 3.2 kHz to 5.5 kHz at +12 st, and pitch sweeps mid-playback never dropped to silence. Phone portrait was checked at 390 px width in an iframe only. **Still to do by a human:** play on a real phone and listen for dropouts during pitch changes; that is the one unchecked box above.

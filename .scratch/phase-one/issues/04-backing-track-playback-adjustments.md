# 04: Backing Track playback with live Adjustments

**What to build:** A singer opens a Track and plays its Backing Track from a persistent bottom player bar with play, pause, seek, and elapsed and remaining time. Pitch and tempo controls change the sound immediately while the song keeps playing: pitch from minus twelve to plus twelve semitones, tempo from fifty to one hundred fifty percent, independent by default with a link toggle for the turntable feel, and a reset. The current values are always visible. The last Adjustments used on a Track are remembered.

**Blocked by:** 02 (Import an uploaded file as a Track)

**Status:** ready-for-agent

- [ ] The Backing Track WAV is served with HTTP range support and fetched and decoded once in the browser into an AudioBuffer
- [ ] Playback runs through a Rubber Band WebAssembly node applying pitch and tempo in real time; changing either updates the node without restarting playback
- [ ] Adjustments are a plain parameter object (pitch semitones integer, tempo percent integer, linked boolean) validated on the API and shared with the browser engine
- [ ] The player bar shows play, pause, a seek bar, elapsed and remaining time in song time, and the Track's cover and title, and persists across the library and Track detail pages
- [ ] Pitch and tempo controls, a link toggle, a reset button, and the current values are shown on the Track detail page and are usable with a thumb on a phone
- [ ] The last Adjustments are saved to the Track on change and restored when the Track is opened again
- [ ] Reported position accounts for tempo, so the seek bar and times show song time rather than wall time
- [ ] API tests cover range requests on the Backing Track and Adjustments validation and persistence
- [ ] Vitest covers the Adjustments validation and the tempo-to-song-time position mapping
- [ ] The Web Audio graph is verified manually on a laptop and a phone, including pitch changes mid-playback with no dropouts

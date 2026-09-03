# 09: Render, play, and download a Mix

**What to build:** From the review screen or a Take's entry, a singer presses render and a Mix is produced on the server from the Take's stored Adjustments, nudge, and gains, so it sounds like the review playback. The Mix covers the full Backing Track with the vocal placed at the Take's start position, silent elsewhere. Progress shows while it renders, and a failure shows its error with a retry. Finished Mixes are listed under the Track and Take, play inside the app, download as MP3 by default or WAV, and can be deleted. A Mix can be re-rendered from the same Take with different gains or pitch.

**Blocked by:** 08 (Review a Take)

**Status:** ready-for-agent

- [ ] The Mix table exists with Take id, MP3 and WAV paths, the exact render parameters (pitch, tempo, nudge, gains), job reference, and timestamps
- [ ] Requesting a Mix creates a render job carrying the Take's tempo and the requested pitch, nudge, and gains; tempo cannot be overridden
- [ ] The worker render job applies pitch and tempo to the Backing Track with Rubber Band via ffmpeg, places the Take vocal at start position plus nudge with its gain, sums with the backing at its gain, and exports MP3 320 and WAV when requested
- [ ] The job writes coarse progress steps and the UI shows them; a failure records the error and offers retry
- [ ] Mixes are listed on the Track page under their Take, playable in-app, downloadable as MP3 or WAV, and deletable individually
- [ ] Re-rendering from the same Take with new gains or pitch creates a new Mix without touching the old one
- [ ] Worker tests render from short generated fixtures and assert the output duration equals the Backing Track, that vocal energy appears at start position plus nudge, and that gains change relative levels
- [ ] API tests cover Mix request, listing, streaming for playback and download, deletion, and the tempo lock

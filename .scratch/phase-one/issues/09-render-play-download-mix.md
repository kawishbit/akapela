# 09: Render, play, and download a Mix

**What to build:** From the review screen or a Take's entry, a singer presses render and a Mix is produced on the server from the Take's stored Adjustments, nudge, and gains, so it sounds like the review playback. The Mix covers the full Backing Track with the vocal placed at the Take's start position, silent elsewhere. Progress shows while it renders, and a failure shows its error with a retry. Finished Mixes are listed under the Track and Take, play inside the app, download as MP3 by default or WAV, and can be deleted. A Mix can be re-rendered from the same Take with different gains or pitch.

**Blocked by:** 08 (Review a Take)

**Status:** ready-for-human

- [x] The Mix table exists with Take id, MP3 and WAV paths, the exact render parameters (pitch, tempo, nudge, gains), job reference, and timestamps
- [x] Requesting a Mix creates a render job carrying the Take's tempo and the requested pitch, nudge, and gains; tempo cannot be overridden
- [x] The worker render job applies pitch and tempo to the Backing Track with Rubber Band via ffmpeg, places the Take vocal at start position plus nudge with its gain, sums with the backing at its gain, and exports MP3 320 and WAV when requested
- [x] The job writes coarse progress steps and the UI shows them; a failure records the error and offers retry
- [x] Mixes are listed on the Track page under their Take, playable in-app, downloadable as MP3 or WAV, and deletable individually
- [x] Re-rendering from the same Take with new gains or pitch creates a new Mix without touching the old one
- [x] Worker tests render from short generated fixtures and assert the output duration equals the Backing Track, that vocal energy appears at start position plus nudge, and that gains change relative levels
- [x] API tests cover Mix request, listing, streaming for playback and download, deletion, and the tempo lock

## Comments

Implemented. Every checklist item is done, verified both by the automated
suites and by hand: a real dev server plus a real worker process (real
ffmpeg + Rubber Band, no fakes) rendering an actual Track end to end,
watched live in a Chrome tab — render, progress polling, playback, MP3/WAV
download, and delete-with-confirm, from both the Track page's per-Take
"Render" quick action and the Review screen's "Render Mix" button.

The Mix table (`mixes`, migration `0006_mixes.sql`) carries the Take id,
MP3/WAV paths (null until the worker finishes), `wavRequested` (so "not
requested" and "still rendering" aren't confused with each other), every
render parameter, and the render Job's id. Requesting a Mix
(`POST .../takes/:takeId/mixes`) enqueues a `render` job and rejects a tempo
that doesn't match the Take's own with the same "locked, visible rather than
silently ignored" shape ticket 08 established for Review's tempo lock (ADR
0003). The worker's `render` job (`worker/akapela_worker/jobs/render.py`,
`audio.py`'s `render_mix`) runs the Backing Track through ffmpeg's
`rubberband` filter, works out the vocal's wall-clock placement from the
Take's start position plus nudge scaled by the same time ratio the Review
screen's engine uses, pads or trims the output to the tempo-adjusted Backing
Track's exact duration (Rubber Band's own output length drifts a few percent
at extreme pitch shifts), and exports MP3 320 always plus WAV on request.
Progress is written in coarse steps (10/80/100) and polled by both pages
that can show Mixes. A Mix deleted mid-render is handled the way ticket 03's
import job handles a Track deleted mid-import: the worker notices, cleans up
the orphaned files, and fails the job rather than resurrecting the row.

Retrying a failed Mix re-enqueues the same row (`POST .../mixes/:mixId/retry`)
rather than leaving a dead failed entry behind next to a fresh one — the same
shape as the Track's own import retry. Deleting a Take also reclaims its
Mixes' files on disk, not just their rows (the `mixes` table cascades on the
Take, but a cascade only removes rows).

Automated coverage: `tests/api/mixes.test.ts` (request, listing, streaming
for playback and download in both formats, deletion, retry, the tempo lock)
and `worker/tests/test_render.py` (duration matching the Backing Track,
vocal energy at start position plus nudge, tempo scaling both duration and
placement, a large negative nudge trimming instead of going negative, vocal
and backing gain each changing relative levels, progress reporting, and the
deleted-mid-render orphan-file guard) pass, alongside the full existing
suite. `pnpm typecheck`, `pnpm lint`, and `ruff check`/`ruff format --check`
are all clean.

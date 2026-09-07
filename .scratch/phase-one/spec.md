# Spec: Phase One — Import, Sing, Mix

Status: ready-for-agent

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land. Last audited against the tree on 2026-09-06, when `pnpm test` passed with 418 tests across 24 files; 04, 07, and 08 closed on 2026-09-07 once their manual device checks were done.

| # | Ticket | Status | Boxes | What is left |
| - | ------ | ------ | ----- | ------------ |
| 01 | [Walking skeleton: compose, database, job round trip](issues/01-walking-skeleton.md) | done | 10/10 | — |
| 02 | [Import an uploaded file as a Track](issues/02-import-upload-track.md) | done | 10/10 | — |
| 03 | [Import a YouTube URL as a Track](issues/03-import-youtube-track.md) | done | 7/7 | — |
| 04 | [Backing Track playback with live Adjustments](issues/04-backing-track-playback-adjustments.md) | done | 10/10 | — |
| 05 | [Song identification and Lyrics screen via LRCLIB](issues/05-song-identification-lyrics-screen-lrclib.md) | ready-for-human | 13/13 | — |
| 06 | [Genius and Manual Lyrics Providers](issues/06-genius-and-manual-lyrics-providers.md) | ready-for-human | 10/10 | — |
| 07 | [Record a Take](issues/07-record-a-take.md) | done | 11/11 | — |
| 08 | [Review a Take](issues/08-review-a-take.md) | done | 8/8 | — |
| 09 | [Render, play, and download a Mix](issues/09-render-play-download-mix.md) | ready-for-human | 8/8 | — |
| 10 | [Settings page, compose documentation, and device pass](issues/10-settings-compose-docs-device-pass.md) | ready-for-agent | 1/5 | The Settings page and its two missing settings, a README paragraph on yt-dlp breaking, the whole-app device pass, and API tests for the settings that do not exist yet. |

**Where phase one actually stands.** Nine of ten tickets are implemented, and the device and microphone checks that 04, 07, and 08 were waiting on a human for have since been done, closing all three. Ticket 10 is the only one with work left for an agent, and the bulk of it is the Settings page: `GET`/`PUT /api/settings` and the `settings` table exist but carry only `defaultLyricsProvider`, there is no page to reach them from, and the microphone-processing and Monitoring defaults are still literals in `app/composables/useTakeRecorder.ts`. Its compose criterion is done, and its README criterion is done but for the yt-dlp paragraph — both of those landed under `.scratch/aspire-local-dev/` ticket 06 rather than here.

## Problem Statement

I want to sing along to an instrumental with lyrics on screen and end up with a recording of my voice mixed over that instrumental. Today that means finding a karaoke video on YouTube, downloading it, fixing its pitch in a desktop audio editor when it doesn't suit my voice, putting lyrics on a second screen when the video has none, recording myself separately, and then combining the two recordings by hand. Every step is a different tool. The Android karaoke apps that promise to do this in one place are ad-ridden, lock pitch control behind premium tiers, and have tiny catalogues.

## Solution

Akapela is a self-hosted web app. I paste a YouTube URL or upload an audio file and get a Track in my library. Akapela finds the Song, pulls Lyrics from the Lyrics Provider I choose, and shows them Spotify-style, highlighting the current line as the Backing Track plays. I change pitch in semitones and tempo in percent while the song plays and hear the result immediately. I press record, sing on the Lyrics screen, and get a Take. I review the Take over the Backing Track, nudge it into alignment, and render a Mix, which I download as an MP3 or WAV. Everything runs from a docker compose file on my laptop. No accounts, no ads, no catalogue limits beyond what I can find or upload.

This spec covers phase one: import, Backing Track playback, Lyrics, Adjustments for pitch and tempo, Take recording, and Mix rendering. Vocal removal, effects such as reverb, Presets, offline PWA behaviour, tap-to-sync, and automatic latency calibration are later phases.

## User Stories

### Library and import

1. As a singer, I want to paste a YouTube URL and have it become a Track in my library, so that I don't have to download anything by hand.
2. As a singer, I want to upload an audio file (mp3, m4a, wav, flac, ogg) and have it become a Track, so that songs not on YouTube still work.
3. As a singer, I want the Track to appear in the library immediately with an "importing" state and a progress indicator, so that I know the app accepted my request.
4. As a singer, I want a YouTube Track to show the video's title and thumbnail as soon as they are known, so that I can recognise it while the audio is still downloading.
5. As a singer, I want an imported Track to have a normalized Backing Track ready to play, so that playback and processing behave the same regardless of the Source format.
6. As a singer, I want to see a clear error on a Track whose import failed, with the failure message and a retry button, so that a broken yt-dlp doesn't leave me guessing.
7. As a singer, I want my library to list every Track with its cover art, title, artist, and duration, so that I can find what to sing.
8. As a singer, I want to search my library by title or artist, so that a large library stays usable.
9. As a singer, I want to delete a Track after one confirmation and have all its Takes and Mixes removed from disk, so that I control my storage.
10. As a singer, I want the library to work on my phone as well as my laptop, so that I can sing wherever I am.

### Song identification

11. As a singer, I want Akapela to guess the artist and title from the YouTube title, stripping words like Karaoke, Instrumental, Lyrics, Official, and HD, so that I rarely have to type them.
12. As a singer, I want to see the top few Song matches from the Lyrics Provider and confirm one with a tap, so that a wrong guess is cheap to fix.
13. As a singer, I want to edit the artist and title by hand when no match is right, so that obscure songs still get Lyrics.
14. As a singer, I want to change the confirmed Song later, so that a mistake doesn't force me to re-import.
15. As a singer, I want an uploaded Track with no Song to still be playable and recordable, so that Lyrics are optional.
16. As a singer, I want the Track's cover art to update to the Song's album art once a Song is confirmed via Genius, so that my library looks like a music app rather than a list of video thumbnails.

### Lyrics

17. As a singer, I want to choose between LRCLIB and Genius as the Lyrics Provider per Track, so that I can pick whichever has the correct text for that Song.
18. As a singer, I want a default Lyrics Provider set once in settings, so that I don't choose every time.
19. As a singer, I want Synced Lyrics when the provider has them, so that the current line is highlighted as the song plays.
20. As a singer, I want Plain Lyrics when only unsynced text exists, so that I still have words on screen.
21. As a singer, I want to paste Lyrics by hand as a Manual Lyrics Provider, so that a song missing everywhere still works.
22. As a singer, I want to edit fetched Lyrics text and have them become Manual, so that a typo in the source doesn't stick.
23. As a singer, I want refetching from a provider to ask before overwriting Manual Lyrics, so that my edits aren't lost by accident.
24. As a singer, I want to see which Lyrics Provider the current Lyrics came from, so that I know what I'm looking at.
25. As a singer, I want a clear message when no provider has Lyrics for the Song, with a shortcut to paste them, so that I'm not stuck.

### Lyrics screen

26. As a singer, I want the Lyrics screen to show the current line bright and bold with past and future lines dimmed, so that my eye lands on the right words.
27. As a singer, I want the current line to stay vertically centred as the song advances, so that I never have to scroll while singing.
28. As a singer, I want the lyric text large enough to read from arm's length on a phone and across a desk on a laptop, so that I can sing standing up.
29. As a singer, I want to tap a Synced line to seek the Backing Track to that moment, so that I can practise one section.
30. As a singer, I want Plain Lyrics to auto-scroll proportionally to the song's duration, so that they still roughly track the song.
31. As a singer, I want manual scrolling to pause auto-scroll for a few seconds and then resume, so that I can glance ahead without fighting the screen.
32. As a singer, I want a Lyrics Offset control in tenths of a second, saved per Track, so that Lyrics timed to the studio version line up with a karaoke version whose intro differs.
33. As a singer, I want Lyrics timing to follow the tempo automatically, so that slowing the song down doesn't desync the words.
34. As a singer, I want the Lyrics screen to use the Track's cover art as its only source of colour on an otherwise dark surface, so that it feels like the music app I already use.

### Playback and Adjustments

35. As a singer, I want a persistent bottom player bar with play, pause, seek, and elapsed and remaining time, so that transport is always one tap away.
36. As a singer, I want a pitch control in semitones from minus twelve to plus twelve, so that I can move a song into my range.
37. As a singer, I want a tempo control from fifty to one hundred fifty percent, so that I can slow a song down to learn it.
38. As a singer, I want pitch and tempo changes to be audible immediately while the song keeps playing, so that I can find the right setting by ear.
39. As a singer, I want pitch and tempo independent by default, so that slowing down doesn't drop the key.
40. As a singer, I want a link toggle that ties pitch to tempo like a turntable, so that the slowed vinyl feel is one switch away.
41. As a singer, I want a reset button that returns Adjustments to zero and one hundred percent, so that I can compare to the original quickly.
42. As a singer, I want the last Adjustments used on a Track remembered, so that I don't redo them next time.
43. As a singer, I want the current pitch and tempo values visible at all times during playback and recording, so that I know what I'm singing to.
44. As a singer, I want the Backing Track to load and decode once and then respond instantly to Adjustments, so that the app feels like an instrument, not a form.

### Recording a Take

45. As a singer, I want to grant microphone access once and choose which input device to use, so that my USB mic works.
46. As a singer, I want echo cancellation, noise suppression, and auto gain off by default, so that the browser doesn't mangle my singing.
47. As a singer, I want a toggle to turn those processors back on, so that a noisy laptop mic is still usable.
48. As a singer, I want a Monitoring toggle, off by default, that plays my voice back in my headphones while recording, so that I can choose whether to hear myself.
49. As a singer, I want to press record and get a three-second countdown before the Backing Track starts, so that I'm ready on the first line.
50. As a singer, I want to start a Take from any position in the song, so that I can redo just the chorus.
51. As a singer, I want the Lyrics screen and Adjustments values visible during recording, so that recording feels the same as rehearsing.
52. As a singer, I want an input level meter during recording, so that I know the mic is working and not clipping.
53. As a singer, I want to stop recording at any point and keep what I have, so that a mistake near the end doesn't waste the whole Take.
54. As a singer, I want the Take captured as uncompressed audio that is sample-aligned to the Backing Track position it started at, so that the Mix lines up.
55. As a singer, I want the Take to record which Adjustments were in force, so that the Mix reproduces what I heard.
56. As a singer, I want the Take uploaded and saved to the server automatically when I stop, so that a browser crash afterwards doesn't lose it.
57. As a singer, I want to see upload progress and a confirmation, so that I know the Take is safe.

### Reviewing a Take

58. As a singer, I want a review screen after recording that plays my Take over the Backing Track, so that I can hear the result before rendering.
59. As a singer, I want a latency nudge slider in milliseconds with a sensible default, so that I can fix the delay between what I heard and what was recorded.
60. As a singer, I want the nudge to be audible immediately during review playback, so that I can align by ear.
61. As a singer, I want the nudge value remembered as a per-device default for the next Take, so that I don't re-tune it every time.
62. As a singer, I want a vocal gain and a backing gain control on the review screen, so that my voice sits at the right level.
63. As a singer, I want to change the Backing Track pitch after recording while tempo stays locked, so that I can retune the backing without my vocal drifting out of time.
64. As a singer, I want to discard a Take from the review screen, so that a bad attempt disappears in one tap.
65. As a singer, I want to keep a Take without rendering, so that I can come back and render later.
66. As a singer, I want every kept Take listed under its Track with date, duration, and start position, so that I can find the good one.
67. As a singer, I want to delete an individual Take, so that the library doesn't fill with bad attempts.

### Rendering and downloading a Mix

68. As a singer, I want to render a Mix from a Take with one action, so that combining voice and backing is no longer my job.
69. As a singer, I want the Mix rendered on the server from the Take's stored Adjustments, nudge, and gains, so that it sounds like what I heard on the review screen.
70. As a singer, I want the Mix to cover the full Backing Track with my vocal placed at the Take's start position and silence elsewhere, so that a chorus-only Take still produces a complete song.
71. As a singer, I want a progress indicator while the Mix renders, so that I know it's working.
72. As a singer, I want a failed render to show its error and offer a retry, so that I'm not stuck.
73. As a singer, I want to download the Mix as MP3 by default and WAV optionally, so that I can share or archive it.
74. As a singer, I want to play the Mix inside the app, so that I don't have to download it to hear it.
75. As a singer, I want every Mix listed under its Track and Take, so that I can compare renders.
76. As a singer, I want to delete an individual Mix, so that storage stays under control.
77. As a singer, I want to re-render a Mix from the same Take with different gains or pitch, so that a bad balance doesn't mean re-singing.

### Jobs and reliability

78. As a singer, I want long operations (import, render) to run in the background and show status on the Track, so that I can keep using the app.
79. As a singer, I want jobs to run one at a time in order, so that my laptop isn't overwhelmed.
80. As a singer, I want a failed job to stop rather than retry automatically, so that a yt-dlp that needs updating doesn't churn.
81. As a singer, I want to see the last error for a Track, so that I can tell a network failure from a broken tool.
82. As a singer, I want the worker to recover on restart and resume any job it was in the middle of, so that a container restart doesn't strand a Track.

### Self-hosting

83. As a self-hoster, I want to run the whole app with one docker compose file, so that setup is a single command.
84. As a self-hoster, I want the app and worker as separate compose services, so that I can set CPU and memory limits per service.
85. As a self-hoster, I want one data volume holding the database and all audio, so that backup is copying one directory.
86. As a self-hoster, I want to choose between a named volume and a bind-mounted host directory, so that I control where files live.
87. As a self-hoster, I want secrets such as the Genius token supplied by environment variables, so that nothing sensitive is in the image.
88. As a self-hoster, I want the app to work with no Genius token, using LRCLIB and Manual only, so that a token is optional.
89. As a self-hoster, I want recommended resource limits documented in the compose file, so that I know what the worker needs.
90. As a self-hoster, I want the app to bind to a configurable port, so that it fits my existing setup.
91. As a self-hoster, I want no login and no accounts, so that there's nothing to administer.

### Design and responsiveness

92. As a singer, I want the UI to follow the dark, pill-shaped, green-accented Spotify vibe defined in DESIGN.md, so that it feels familiar.
93. As a singer, I want the app to be installable as a PWA, so that it opens like a native app on my phone and laptop.
94. As a singer, I want layouts that adapt from phone portrait to laptop widescreen without losing any control, so that I'm not forced onto one device.
95. As a singer, I want controls large enough to hit with a thumb, so that I can adjust pitch mid-song on a phone.
96. As a singer, I want the app to respond to every tap within a frame, with no jank on the Lyrics screen, so that it never distracts from singing.

## Implementation Decisions

### Shape of the system

- Two docker compose services: the Nuxt app and a Python worker. Both mount the same data volume. The app inserts jobs into SQLite and reads their status; the worker polls the jobs table and executes them. See ADR 0002.
- Metadata lives in one SQLite database on the data volume, accessed by the app through Drizzle with better-sqlite3 in WAL mode, and by the worker through Python's sqlite3. The schema is owned by the app; the worker reads and writes only the tables it needs.
- Audio files live under a per-Track directory on the data volume: the original Source audio as delivered, a normalized 44.1 kHz stereo WAV Backing Track, each Take as WAV, and each Mix as MP3 and optionally WAV. See ADR 0005.
- Every job runs one at a time in the worker. Jobs have states queued, running, succeeded, failed. A failed job stores its error message. Jobs found in the running state at worker startup are reset to queued.
- No authentication, no accounts, no rate limiting.

### App configuration

- Environment variables: the data directory path, the HTTP port, the Genius access token (optional), and the default Lyrics Provider.
- Settings changeable in the UI and stored in the database: default Lyrics Provider, microphone processing toggles, Monitoring default. The per-device latency nudge default lives in browser storage since it is device-specific.

### Domain model and schema

- Track: id, title, artist, duration, cover art path, Source kind and Source reference (URL or original filename), import state, confirmed Song (nullable), last Adjustments, Lyrics Offset, timestamps.
- Song: artist, title, provider-specific ids where known, album art URL. Embedded on the Track rather than a separate table, since a Track has at most one confirmed Song.
- Lyrics: one row per Track. Provider (lrclib, genius, manual), kind (synced, plain), lines as a JSON array of objects with text and optional timestamp in milliseconds. Refetching replaces the row, after confirmation if the current provider is manual.
- Take: id, Track id, start position in milliseconds, duration, file path, Adjustments at record time (pitch, tempo, linked), latency nudge in milliseconds, vocal gain, backing gain, timestamps.
- Mix: id, Take id, file paths for MP3 and WAV, the exact parameters used to render (pitch, tempo, nudge, gains), job reference, timestamps.
- Job: id, type (import, render), target id, state, error, progress percent, timestamps.
- Adjustments are a plain parameter object: pitch semitones as an integer, tempo as a percentage integer, linked as a boolean. This same shape is consumed by the browser engine and by the worker's render step. See ADR 0003.

### HTTP API (app)

- Create Track from YouTube URL or from multipart upload. Returns the Track immediately in importing state and enqueues an import job.
- List Tracks with optional search query. Get one Track with its Lyrics, Takes, Mixes, and latest job.
- Delete Track, cascading to files.
- Search Song candidates for a Track given artist and title, returning the top matches from the chosen Lyrics Provider. Confirm a Song for a Track.
- Fetch Lyrics for a Track from a named provider. Set Manual Lyrics. Update Lyrics Offset. Update last Adjustments.
- Upload a Take as a WAV file with its metadata. List, get, update review parameters (nudge, gains, pitch), and delete Takes.
- Request a Mix render for a Take. List, get, and delete Mixes. Stream a Mix file for playback and download.
- Stream the Backing Track WAV with range support so the browser can fetch and decode it.
- Get job status. The client polls at a short interval while any job is active; no websockets or server-sent events in phase one.
- Cover art and audio files are served through the app from the data directory, never exposed directly.

### Lyrics Providers (app)

- A Lyrics Provider interface with two operations: search Songs by artist and title, and fetch Lyrics for a chosen Song. Implementations: LRCLIB (public API, no key, returns synced and plain), Genius (API for search and metadata, HTML scraping of the song page for lyrics text, plain only, requires token), Manual (no remote calls).
- Providers are selected by name. The Genius provider reports itself unavailable when no token is configured, and the UI hides it.
- YouTube title parsing is a pure function: strip bracketed and parenthesised segments containing noise words, strip standalone noise words, split on the first dash or pipe, and return artist and title candidates in both orders.

### Worker jobs (Python)

- Import job: for a YouTube Source, fetch metadata (title, thumbnail, duration) and write them to the Track first so the UI updates early, then download best audio via yt-dlp. For an Upload Source, skip fetching. Then normalize to the Backing Track WAV with ffmpeg, write duration, and mark the Track ready.
- The Source fetcher is a small interface wrapping yt-dlp so tests can substitute a fake that copies a fixture.
- Render job: apply the Take's Adjustments to the Backing Track with Rubber Band via ffmpeg, place the Take's vocal at its start position plus nudge with its gain, sum with the backing at its gain, export MP3 320 and WAV when requested. Tempo is taken from the Take and cannot be overridden; pitch and gains come from the Mix request. See ADR 0003 and 0004.
- Progress is written to the job row in coarse steps so the UI can show it.
- Worker startup resets stale running jobs to queued, then polls the jobs table on a short interval.

### Browser audio engine

- The Backing Track WAV is fetched once and decoded into an AudioBuffer. Playback goes through a Rubber Band WebAssembly node applying pitch and tempo in real time, then to the output. See ADR 0004.
- Adjustments changes update the node's parameters without restarting playback. Position reporting accounts for tempo so the Lyrics screen and player bar show song time, not wall time.
- Recording uses an AudioWorklet capturing raw PCM from the selected microphone at the context sample rate, accumulating into a buffer, and encoding to WAV in the browser on stop. The Take's start position is the song position at the moment the Backing Track started after the countdown. See ADR 0006.
- Monitoring, when on, routes the microphone through the output with no processing.
- Review playback plays the Take buffer against the Backing Track through the same engine, with the nudge applied as a time offset on the vocal and gains as separate gain stages, so what is heard matches what the worker renders.
- Microphone constraints default to echo cancellation, noise suppression, and auto gain all false, with a settings toggle.

### Lyrics screen behaviour

- The current line is computed by a pure function from song position, the Lyrics lines, and the Lyrics Offset. Because position is already in song time, tempo needs no extra handling in this function.
- Synced: the current line is centred by scrolling the container; lines are tappable to seek.
- Plain: scroll position is proportional to song position over duration; a manual scroll suspends auto-scroll for a few seconds.
- Lyrics Offset is edited with plus and minus buttons in tenths of a second and persisted on the Track.

### UI structure

- Pages: library (grid of Track cards with the import entry point), Track detail (cover, Song confirmation, Lyrics Provider choice, Adjustments, Takes, Mixes), Sing (full-screen Lyrics with transport, Adjustments, and record control), Review (Take playback with nudge, gains, pitch, keep, discard, render), and Settings.
- A persistent bottom player bar on library and Track detail pages.
- Tailwind v4 with tokens derived from DESIGN.md. Figtree self-hosted. Lucide icons. Dark only. No component library.
- PWA shell via the Nuxt PWA module with an installable manifest; no offline caching of audio in phase one.

### Tooling

- pnpm, Nuxt 4, TypeScript strict, Drizzle with better-sqlite3, Vitest, @nuxt/eslint. Worker on Python 3.12 managed with uv, with yt-dlp, ffmpeg, and Rubber Band installed in its image.
- English UI only.
- GPL-3.0 license.

## Testing Decisions

A good test exercises behaviour observable from outside a module: an HTTP call and its response plus the resulting database rows and files, a job and the files it produces, a pure function and its return value. Tests never inspect internal state, private helpers, or call order. Tests use the glossary vocabulary in their names: Track, Backing Track, Song, Lyrics, Take, Mix.

Three seams, agreed with the user:

1. **App HTTP API.** Route handlers are invoked in-process against a real SQLite database and a data directory created in a temp folder per test. Lyrics Providers are replaced by fakes returning canned search results and Lyrics. Covered: Track creation from URL and upload, Track listing and search, Track deletion cascading to files, Song search and confirmation, Lyrics fetch per provider including the Manual overwrite confirmation, Lyrics Offset and Adjustments persistence, Take upload and metadata, Mix request creating a job, job status reporting, and file streaming with range headers.
2. **Worker job runner.** The Python runner is given a job row and a temp data directory and its outputs are asserted: files present, durations correct within tolerance, Track and job rows updated, errors recorded on failure. The Source fetcher is faked to copy a fixture file. ffmpeg and Rubber Band run for real on short generated audio, and the render test asserts that the vocal lands at the Take's start position plus nudge by checking where energy appears in the output. Stale-job recovery at startup is tested.
3. **Pure client modules.** Vitest on: the YouTube title parser, the current-line function for Synced and Plain Lyrics with and without Lyrics Offset, the PCM-to-WAV encoder (header fields, sample count, round trip), and the Adjustments parameter object validation shared with the API.

The Web Audio graph, the AudioWorklet, microphone selection, and the visual layout are verified manually on a laptop and a phone. No browser end-to-end suite in phase one.

Prior art: none, the repo is empty. These tests establish the patterns later phases follow.

## Out of Scope

- Vocal removal and Stems (phase two).
- Reverb, other effects, and Presets including Slowed and Reverb (phase two).
- Offline playback of processed Tracks and any PWA caching beyond the app shell.
- Tap-to-sync for turning Plain Lyrics into Synced Lyrics.
- Automatic latency calibration.
- Comping across Takes, pitch correction or autotune on the vocal, any vocal processing beyond gain and placement.
- Video playback of any kind (ADR 0001).
- Accounts, sharing, access control, rate limiting.
- Sources other than YouTube and Upload.
- Backups, trash, undo.
- Musixmatch or any Lyrics Provider beyond LRCLIB, Genius, and Manual.
- Websockets or server-sent events for job progress.
- Localisation.

## Further Notes

- Genius lyrics come from scraping the song page HTML, since the Genius API returns only metadata and annotations. Keep that scraper isolated behind the provider interface so it can be fixed without touching anything else. yt-dlp has the same fragility; the Source fetcher interface exists for the same reason.
- Rubber Band makes the project GPL-3.0 (ADR 0004). Any dependency added later must be GPL-compatible.
- Lyrics Offset is a per-Track property, not per-Lyrics, because it corrects for the Backing Track's intro rather than the text. Refetching Lyrics should not reset it.
- Tempo is locked once a Take exists because the vocal was sung to it. The review and Mix screens should make this visible rather than silently disabling the control.
- The `.scratch/` directory holds specs and issues. Decide before the first commit whether it is committed or ignored.

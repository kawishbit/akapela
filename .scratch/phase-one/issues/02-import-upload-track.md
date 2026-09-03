# 02: Import an uploaded file as a Track

**What to build:** A singer picks an audio file (mp3, m4a, wav, flac, ogg) from the library page and it becomes a Track. The Track appears immediately in importing state with a progress indicator, the worker normalizes it into the Backing Track WAV, and the Track turns ready with its duration and a generated achromatic placeholder cover. The library is a grid of Track cards with cover, title, artist, and duration, searchable by title or artist. A Track can be deleted after one confirmation, removing every file under it. A failed import shows its error on the card with a retry button.

**Blocked by:** 01 (Walking skeleton)

**Status:** done

- [x] The Track table exists with title, artist, duration, cover art path, Source kind and Source reference, import state, and timestamps; each Track has its own directory on the data volume
- [x] Uploading a supported file creates a Track in importing state, stores the original as delivered under the Track directory, and enqueues an import job; unsupported files are rejected with a clear message
- [x] The import job normalizes the original to a 44.1 kHz stereo WAV Backing Track with ffmpeg, writes the duration, and marks the Track ready
- [x] The library grid shows every Track with cover, title, artist, and duration, and a search box filters by title or artist
- [x] A Track in importing state shows progress; a Track whose import failed shows the error and a retry button that re-enqueues the job
- [x] Deleting a Track asks once, then removes its database rows and its directory from disk
- [x] Cover art and audio are served through the app from the data directory, never exposed directly
- [x] API tests cover upload creating a Track and job, rejection of unsupported types, listing and search, and deletion cascading to files
- [x] Worker tests cover the import job producing a Backing Track WAV of the expected duration from a short fixture and recording an error on a corrupt input
- [x] The library works in phone portrait and laptop widescreen

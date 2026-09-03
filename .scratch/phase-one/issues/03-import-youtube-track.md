# 03: Import a YouTube URL as a Track

**What to build:** A singer pastes a YouTube URL on the library page and it becomes a Track. The card shows the video title and thumbnail as soon as the worker has fetched metadata, before the audio finishes downloading. The audio is downloaded at best quality, normalized to the Backing Track WAV as in ticket 02, and the Track turns ready. A yt-dlp failure shows on the card with a retry button.

**Blocked by:** 02 (Import an uploaded file as a Track)

**Status:** ready-for-agent

- [ ] Pasting a valid YouTube URL creates a Track in importing state with the URL as its Source reference and enqueues an import job; invalid URLs are rejected with a clear message
- [ ] The worker wraps yt-dlp behind a Source fetcher interface with two steps: fetch metadata (title, thumbnail, duration) and download best audio
- [ ] Metadata is written to the Track before the download starts, so the card shows title and thumbnail early
- [ ] The downloaded audio is stored as delivered and normalized to the Backing Track WAV, then the Track is marked ready
- [ ] A failed fetch records the yt-dlp error on the job and Track, and retry re-enqueues without automatic retries
- [ ] Worker tests use a fake Source fetcher that returns canned metadata and copies a fixture file, and cover the early metadata write, the successful import, and the failure path
- [ ] API tests cover URL validation and Track creation from a URL

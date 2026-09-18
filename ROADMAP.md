# Roadmap

What's planned, in roughly the order it'll be tackled, and what's still being explored. Nothing here has a date. The README carries the one-line version of this list; this file carries the reasoning.

Capitalised terms (Track, Job, Separation, Queue, ...) are defined in `CONTEXT.md`.

## Done

- **Backup and restore** from Settings.
- **Desktop App** (Electron), ADR 0009.
- **Shorter README.** The README says what Akapela is, how to get it, and nothing else. Self-hosting detail lives in `docs/self-hosting.md`, fixes in `docs/troubleshooting.md`, development in `CONTRIBUTING.md`. ADRs aren't linked from the README: they're for people changing the code, not people running it.

## 1. Jobs page

**Why first:** a Spotify playlist import creates dozens of Jobs, and today there's no single place to see them. Every later item that makes background work (faster Separation, playlist import, lyrics timing) needs this page to be observable.

**Decided**

- A **Jobs** page lists every Job (imports, Separations, Mixes), not only Separations: its Track, what it's doing, its state, and progress. A Separation reports a real percentage (chunks done out of total).
- Actions: cancel a queued or running Job, retry a failed one, clear finished ones. No manual reordering for now.
- Jobs run in two **Lanes**, side by side: a heavy Lane for Separations and a light Lane for imports and Mixes, each still one at a time. A Mix never waits behind forty Separations, and two Separations never split the CPU between them. See ADR 0012.

**Open**

- Where cancelling a running Separation leaves the Track (no Stems, and Separation marked as cancelled rather than failed).
- Whether a Library card links to its Job on the Jobs page.

## 2. Queue

Karaoke runs on a list of who sings next. Today there's only the Library.

**Decided**

- One **Queue** per install, stored on the server. Every device in the house sees and adds to the same Queue; the Desktop App has the same thing.
- A **Queue Entry** is a Track plus an optional singer name (free text; there are no accounts). The same Track can be queued more than once.
- Actions: add, remove, drag to reorder, clear, **Play next** (move to the top).
- When a Take finishes, or the singer leaves the Sing screen, the entry is removed and an **Up next** prompt offers the next one. Nothing starts on its own.
- A Track whose Separation hasn't finished can still be queued. Its entry shows the Separation's progress. If it reaches the top before it's ready, the singer chooses between singing over the original audio and skipping it for now.

**Open**

- Whether an empty Queue changes what the home screen shows.
- What a phone that's only adding to the Queue sees (the full app, or a lighter "add a song" view).

## 3. Faster Separation

A Separation takes minutes per song on the 2-CPU default Docker allotment. Most people run Akapela with Docker, so this has to get faster there first, not only in the Desktop App.

Separation always runs on the machine hosting Akapela, never in the browser (ADR 0013). A browser or PWA is only a window onto that machine, so "acceleration on the web" means acceleration on the server.

**Layer 1: faster on CPU, for everyone.** Do this first.

- Profile where a Separation's time goes: the hand-written STFT in `server/lib/separators/stft.ts`, the ONNX model call, the overlap between chunks, and the float64 arrays around a float32 model.
- Offer a **Fast / Best** quality choice: `Inst_Main` (current, smaller, cuts off above ~17.6 kHz) against `Inst_HQ_3` (full bandwidth, larger, slower). See ADR 0008's amendment.

**Layer 2: GPU, where there is one.**

- **Docker, NVIDIA (Linux, or Windows through WSL2):** a CUDA image variant and a `docker-compose.gpu.yml` override. The self-hoster installs the NVIDIA Container Toolkit. The image is several GB larger, so it stays a separate, opt-in image and never the default.
- **Docker on macOS:** no GPU is reachable from a container, so this stays CPU-only whatever Akapela does.
- **Desktop App:** an **Acceleration** setting, Auto or CPU only. Auto tries DirectML on Windows and CoreML on Apple Silicon, and falls back to CPU if either fails.
- **Batching chunks.** A song is already cut into overlapping chunks, run one after another. Running them at the same time on a CPU gains almost nothing, since each chunk's model call already uses every core, and it multiplies memory. On a GPU, several chunks go into one model call (the model's batch dimension), which is where parallel chunk processing pays off. It belongs to this layer, not before it.

**Explore, not committed**

- AMD (ROCm) and Intel (OpenVINO) on Linux. Each would need its own image.

## 4. Spotify playlist import

Paste a Spotify playlist link; Akapela lists its songs, finds each one on YouTube, imports it, and separates it. Progress is visible on the Jobs page and in the Library.

**Decided**

- **No cap on playlist size.** Before starting, Akapela shows how many songs and roughly how long the Separations will take, with a checklist of songs, all ticked. A cap would only hide the cost; the checklist lets the singer choose.
- Songs already in the Library are skipped.
- Each song is matched by searching YouTube for "artist – title" and taking the first result within ±10 s of Spotify's duration, preferring audio-only and "Topic" uploads over music videos. A song with no match shows as failed, and can be retried with a pasted YouTube link.
- Each imported Track gets its Song confirmed from Spotify's artist and title, its Lyrics fetched, and its Separation queued, all without asking. It's the one import where the singer has clearly asked for everything.
- Reading the playlist sits behind one interface, the way `SourceFetcher` wraps yt-dlp, so the route to Spotify can be swapped without touching the rest.

**Open: how to read the playlist.** Decided by the maintainer after a spike on route (a). What's known as of September 2026:

- **(a) Spotify's public embed page, no login.** Nothing to set up for the user. Unofficial: it can break without warning, the way YouTube breaks yt-dlp. Unknown until the spike: whether it returns every song of a long playlist or only the first ~100.
- **(b) "Log in with Spotify" through Akapela's own shared app.** The login itself needs no secret (OAuth with PKCE), but:
  - Since February 2026, an app in Spotify's Development Mode only receives a playlist's songs if the logged-in user owns or collaborates on that playlist. Editorial playlists and friends' playlists come back without songs.
  - A Development Mode app is limited to 5 users, and its owner needs Spotify Premium. Lifting the limit (Extended Quota) requires a registered business with 250,000 monthly active users.
  - Spotify only accepts HTTPS redirects, or `http://127.0.0.1`. A Docker install at `http://192.168.1.20:3000` can't complete the login unless it's opened on the server machine itself. The Desktop App can, since it runs on loopback.
- **(c) Each self-hoster registers their own Spotify app** and pastes its Client ID, like the Genius token. Sidesteps the 5-user limit, but has the same "only your own playlists" rule as (b), needs Premium, and is the setup step people find most confusing.

On what's known today, (b) and (c) can't import the playlists people most want to sing through, so (a) is the likely route and (b)/(c) only a fallback for one's own playlists.

## 5. More languages

**Decided** (ADR 0014)

- `@nuxtjs/i18n`, with one JSON file per language, loaded only when that language is used. Adding a language means adding one JSON file.
- The browser's language is the default; Settings can override it.
- Server errors the singer sees (a failed Job's reason, for example) are sent as stable codes, and the browser translates them. Logs stay in English.
- Worth doing early: every new screen adds more text to move into the JSON files.

**Open**

- Which language comes after English.

## 6. Automatic lyrics timing (Auto Lyrics Offset)

Synced Lyrics from LRCLIB are timed against the studio recording. A YouTube upload with a longer intro drifts by a constant amount, which the singer fixes today by hand with the Lyrics Offset.

**Decided**

- Detect the offset automatically, by comparing where singing starts in the Vocals Stem with where the Synced Lyrics say the first lines are. This needs no speech model.
- When the Track has no Lyrics Offset yet (the normal case after import), the detected one is applied and shown as "Offset set automatically: +1.2 s", with Undo.
- An offset the singer set by hand is never overwritten; the detected one is offered as a suggestion instead.
- Without Stems, it falls back to detecting singing in the original audio, which is less reliable.

**Open**

- Whether a constant offset is enough, or a speed factor is needed as well, for live versions and sped-up uploads. Only if item 7 doesn't already cover it.

## 7. Lyrics syncing for unsynced lyrics (research)

Genius and pasted Lyrics are Plain: no timing, so nothing scrolls. The goal is to line known text up against the Vocals Stem, line by line and possibly word by word. This is alignment, not transcription: Akapela never writes Lyrics from nothing.

Candidates to compare:

- **WhisperX:** Whisper plus wav2vec2 forced alignment. Strong word timings; Python and PyTorch.
- **stable-ts:** stabilised Whisper timestamps with an alignment mode for known text; Python.
- **whisper.cpp:** native, with word timestamps; no Python. Alignment of known text would need building on top.
- **Montreal Forced Aligner:** classic forced alignment; per-language acoustic models; Python/Kaldi.

Criteria: alignment quality on sung vocals, model size (downloaded into `cache/` like the separation model), a licence compatible with GPL-3.0 (ADR 0004), and whether it runs from Node or ONNX without bringing Python back into the image (ADR 0002's amendment removed it).

## Later

In roughly this order, unchanged from before:

- Deezer import
- SoundCloud import
- Automatic latency calibration
- YouTube video playback alongside the Backing Track

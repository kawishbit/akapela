# Roadmap

What's planned, in roughly the order it'll be tackled, and what's still being explored. Nothing here has a date. The README carries the one-line version of this list; this file carries the reasoning.

Capitalised terms (Track, Job, Separation, Queue, ...) are defined in `CONTEXT.md`.

## Done

- **Backup and restore** from Settings.
- **Desktop App** (Electron), ADR 0009.
- **Shorter README.** The README says what Akapela is, how to get it, and nothing else. Self-hosting detail lives in `docs/self-hosting.md`, fixes in `docs/troubleshooting.md`, development in `CONTRIBUTING.md`. ADRs aren't linked from the README: they're for people changing the code, not people running it.
- **Jobs page.** `/jobs` lists every Job (imports, Separations, Mixes) with its Track, what it's doing, its state, and its progress; a Separation reports a real percentage, chunk by chunk. Cancel a queued or running Job, retry a failed one, clear finished ones. Cancelling puts the target back the way it was: a Separation's Track returns to no Stems or to the Stems it had, a cancelled import's Track is deleted, a cancelled Mix's row is deleted. Jobs run in two Lanes, heavy for Separations and light for everything else, so a Mix never waits behind a Separation (ADR 0012). A header badge counts what's queued or running, and a Library card's progress chip opens its Job's row. Spec in `.scratch/jobs-page/`.
- **Queue.** One Queue per install, on the server, shared by every device. `/queue` adds (with an optional singer name), removes, drags to reorder, **Play next**, renames, clears, and searches the Library to add from. Singing an entry uses it up when the turn ends, and **Up next** offers whoever is first; nothing starts on its own. An entry whose Separation hasn't finished asks first: sing over the original, or leave it for now. Spec in `.scratch/queue/`.
- **Connect the Desktop App to your server.** First launch asks **Use this computer** or **Connect to a server**; **Change Server…** in the File menu asks again. Connected, the app starts nothing of its own, never falls back to a local library, refuses a server newer than itself, and waits and reconnects when the server goes away. It grants exactly the entered origin secure-context status, so a laptop can sing from a compose install over plain `http://` (ADR 0015). `docs/self-hosting.md` says why singing needs that. One check is still open: recording a Take Connected to a real second machine, which the suite can't do. Spec in `.scratch/connected-desktop/`.

## 1. Separation: models, acceleration, storage

A Separation takes minutes per song, and every Track stores three large WAVs. This item lets the singer decide both: which model runs, how much of the machine it may use, whether a GPU helps, and what format the files are kept in. Separation always runs on the machine hosting Akapela, never in the browser, and the settings describe that machine (ADR 0013 and its amendment). Spec in `.scratch/faster-separation/`.

**Decided**

- **Separation Model.** Picked from a curated MDX-Net catalog, with a default in Settings (`Inst_Main`, as today). Each model downloads the first time it's needed. The one that made a Track's Stems is recorded, so the Track can be separated again with another. A Separation keeps the model it was asked for with, even if the default changes while it waits (ADR 0008 amendment).
- **CPU.** A core limit, defaulting to all cores minus one with a minimum of 1. The Separation always runs at lowered OS priority, so a Take recorded alongside it doesn't crackle.
- **Hardware acceleration.** One switch, shown only when a usable GPU backend is found, and on by default when it is: CUDA in Docker, DirectML in the Windows Desktop App, CoreML in the Apple Silicon Desktop App. A GPU that fails partway through falls back to CPU, and the Jobs page says so. There's no GPU limit.
- **Docker, NVIDIA (Linux, or Windows through WSL2).** A `gpu` build target and a `docker-compose.gpu.yml` override. The self-hoster installs the NVIDIA Container Toolkit. The image is several GB larger, so it's never the default.
- **CPU only:** Docker on macOS (no GPU reaches the container), AMD and Intel (no ONNX Runtime build for them), and the Linux Desktop App (CUDA would have to be bundled).
- **Audio Format.** WAV (the default), FLAC, or MP3 320 for the Backing Track master and Stems, applied to new files only (ADR 0016, which supersedes 0005).
- **Using every core, last.** Today only the model call is multi-threaded. The STFT, the copies, and the overlap-add run on one thread while the other cores wait. Profile it, then either overlap each chunk's STFT with the previous chunk's model call or move the STFT into the ONNX graph. Any change must keep each Stem's sample correlation ≥ 0.999 against today's output.

**Explore, not committed**

- Batching chunks into one model call on a GPU (the model's batch dimension). On a CPU this gains nothing, since each call already uses every core.
- Roformer and the other non-MDX-Net families, which each need a pipeline of their own.
- AMD (ROCm) and Intel (OpenVINO) on Linux. Each would need its own ONNX Runtime build and image.

## 2. Spotify playlist import

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

## 3. More languages

**Decided** (ADR 0014)

- `@nuxtjs/i18n`, with one JSON file per language, loaded only when that language is used. Adding a language means adding one JSON file.
- The browser's language is the default; Settings can override it.
- Server errors the singer sees (a failed Job's reason, for example) are sent as stable codes, and the browser translates them. Logs stay in English.
- Worth doing early: every new screen adds more text to move into the JSON files.

**Open**

- Which language comes after English.

## 4. Automatic lyrics timing (Auto Lyrics Offset)

Synced Lyrics from LRCLIB are timed against the studio recording. A YouTube upload with a longer intro drifts by a constant amount, which the singer fixes today by hand with the Lyrics Offset.

**Decided**

- Detect the offset automatically, by comparing where singing starts in the Vocals Stem with where the Synced Lyrics say the first lines are. This needs no speech model.
- When the Track has no Lyrics Offset yet (the normal case after import), the detected one is applied and shown as "Offset set automatically: +1.2 s", with Undo.
- An offset the singer set by hand is never overwritten; the detected one is offered as a suggestion instead.
- Without Stems, it falls back to detecting singing in the original audio, which is less reliable.

**Open**

- Whether a constant offset is enough, or a speed factor is needed as well, for live versions and sped-up uploads. Only if item 5 doesn't already cover it.

## 5. Lyrics syncing for unsynced lyrics (research)

Genius and pasted Lyrics are Plain: no timing, so nothing scrolls. The goal is to line known text up against the Vocals Stem, line by line and possibly word by word. This is alignment, not transcription: Akapela never writes Lyrics from nothing.

Candidates to compare:

- **WhisperX:** Whisper plus wav2vec2 forced alignment. Strong word timings; Python and PyTorch.
- **stable-ts:** stabilised Whisper timestamps with an alignment mode for known text; Python.
- **whisper.cpp:** native, with word timestamps; no Python. Alignment of known text would need building on top.
- **Montreal Forced Aligner:** classic forced alignment; per-language acoustic models; Python/Kaldi.

Criteria: alignment quality on sung vocals, model size (downloaded into `cache/` like the separation model), a licence compatible with GPL-3.0 (ADR 0004), and whether it runs from Node or ONNX without bringing Python back into the image (ADR 0002's amendment removed it).

## Later

In roughly this order:

- Converting an existing library to another Audio Format, as Jobs
- Deezer import
- SoundCloud import
- Automatic latency calibration
- YouTube video playback alongside the Backing Track

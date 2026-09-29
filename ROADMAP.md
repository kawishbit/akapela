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
- **Separation: models, acceleration, storage.** A four-minute song separates in about 70 s on the CPU, down from about 200 s, and in about 10 s on a GPU. Settings picks the default Separation Model from a checked MDX-Net catalog (`Inst_Main`, `Inst_HQ_3`, `Inst_HQ_4`, `Kim_Vocal_2`) and says which are downloaded; each downloads the first time it's used, and a Track can be separated again with another. A Separation uses all cores but one by default, at lowered OS priority. Hardware acceleration is on when a GPU backend is found: DirectML on Windows, CoreML on Apple Silicon, CUDA in Docker through the opt-in `gpu` target. A GPU that fails partway through finishes on the CPU. The Backing Track master and Stems can be stored as WAV, FLAC, or MP3 320 (ADR 0016). Every change was held to the Stems' sample correlation ≥ 0.999 against the previous output. One question is still open: the STFT's sign convention, which needs a comparison against UVR on real music (ticket 09). Spec in `.scratch/faster-separation/`.
- **Spotify playlist import.** Paste a Spotify playlist or album link and Akapela lists its songs as a checklist, with how many it will import and roughly how long their Separations will take on this install. Every song is ticked except one whose Song is already in the Library or earlier in the same list. Each ticked song becomes a Track with its Song confirmed from Spotify's artist and title. Its import Job finds it on YouTube, taking the first result within ±10 s of Spotify's duration and preferring "Topic" uploads, then anything that isn't a music video. It then downloads the song, fetches its Lyrics, and queues its Separation, all without asking. A song with no match fails, and is retried with a pasted YouTube link. The rest of the decisions:
  - **Reading Spotify.** The playlist is read from Spotify's public embed page, with no login. This is route (a); routes (b) and (c) are under Later. It sits behind `PlaylistReader`, the way `SourceFetcher` wraps yt-dlp, because the page is unofficial and can change without warning.
  - **At most 100 songs.** The embed page lists at most 100 songs, and the September 2026 spike found no cheap way past that. So a playlist or album over 100 is refused whole, and the singer is asked to make a shorter copy. This replaces the earlier "no cap" decision. The checklist still shows the cost of what's ticked.
  - **One Track per Song.** No two Tracks share a Song, anywhere in the app. Two Songs are the same when their artist and title match exactly, so a remaster is another Song.
  - **The playlist Lane.** Playlist Imports run their imports on a third Lane, so a Mix never waits behind a hundred downloads (ADR 0012 amendment).
  - **The Jobs page.** Each Playlist Import is one row there, with its progress and **Cancel all**.

  Spec in `.scratch/spotify-import/`.

- **Stem Levels.** A separated Track's Backing Source is Original or Stems, and Stems blend the Guide Vocal (the original singer) and the Instrumental, each from silent to as separated. Sliders on the Track page, the Sing screen, and Review change them live. A Take records them as they were when recording started, and a Mix can use others, so you can sing with a faint guide and render without it. Both engines blend before their one stretch (ADR 0003 amendment). Spec in `.scratch/stem-levels/`.

## 1. More languages

**Decided** (ADR 0014)

- `@nuxtjs/i18n`, with one JSON file per language, loaded only when that language is used. Adding a language means adding one JSON file.
- The browser's language is the default; Settings can override it.
- Server errors the singer sees (a failed Job's reason, for example) are sent as stable codes, and the browser translates them. Logs stay in English.
- Worth doing early: every new screen adds more text to move into the JSON files.
- Indonesian comes after English, and ships complete and reviewed rather than falling back to English half-way.
- The Language is chosen per device (a cookie), not per install, and URLs carry no language prefix (ADR 0014 amendment).
- Only the Nuxt app is translated this round. The Desktop shell's own menus, dialogs, and first-launch chooser, and the Website, stay English (see Later).

Spec and tickets in `.scratch/localisation/`.

## 2. Automatic lyrics timing (Auto Lyrics Offset)

Synced Lyrics from LRCLIB are timed against the studio recording. A YouTube upload with a longer intro drifts by a constant amount, which the singer fixes today by hand with the Lyrics Offset.

**Decided**

- Detect the offset automatically, by comparing where singing starts in the Vocals Stem with where the Synced Lyrics say the first lines are. This needs no speech model.
- When the Track has no Lyrics Offset yet (the normal case after import), the detected one is applied and shown as "Offset set automatically: +1.2 s", with Undo.
- An offset the singer set by hand is never overwritten; the detected one is offered as a suggestion instead.
- Without Stems, it falls back to detecting singing in the original audio, which is less reliable.

**Open**

- Whether a constant offset is enough, or a speed factor is needed as well, for live versions and sped-up uploads. Only if item 3 doesn't already cover it.

## 3. Lyrics syncing for unsynced lyrics (research)

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
- Batching chunks into one model call on a GPU (the model's batch dimension); on a CPU it gains nothing
- Roformer and the other non-MDX-Net Separation Model families, which each need a pipeline of their own
- AMD (ROCm) and Intel (OpenVINO) acceleration on Linux, each needing its own ONNX Runtime build and image
- Translating the Desktop shell's own strings (menus, dialogs, the first-launch chooser) and the Website
- Spotify playlists and albums over 100 songs, which the embed page doesn't list. There are two routes, and each works only for the singer's own playlists, because since February 2026 Spotify hands a playlist's songs to an app in Development Mode only if the logged-in user owns or collaborates on it:
  - **(b) "Log in with Spotify"** through a shared Akapela app, with OAuth and PKCE. It is limited to 5 users, and its owner needs Spotify Premium. Spotify only accepts an HTTPS or `http://127.0.0.1` redirect, so a Docker install reached over plain HTTP on the LAN can't complete the login.
  - **(c) A self-hoster's own Spotify app**, whose Client ID they paste in, like the Genius token. It needs Premium too, and it is the setup step people find most confusing.
- Deezer import
- SoundCloud import
- Automatic latency calibration
- YouTube video playback alongside the Backing Track

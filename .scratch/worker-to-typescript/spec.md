# Worker to TypeScript

## Why

The Worker (`worker/`) is Python because yt-dlp and the vocal-separation model were assumed to need it. A 2026-09-09/10 conversation examined `worker/akapela_worker/{sources,audio,separators}.py` and `audio_separator`'s MDX architecture directly and found that's mostly not true: yt-dlp ships standalone per-OS binaries, ffmpeg was always just a subprocess call, and only the vocal-separation model's pre/post-processing (STFT, chunking, overlap-add — done in torch around the ONNX call, confirmed by reading `mdx_separator.py`) is genuinely Python-specific work. Motivated by shrinking install/build size — `audio-separator` pulls in a ~1GB torch dependency (ADR 0008) even for self-hosters who never separate a Track — ahead of a future Electron desktop app, where a second managed process and that dependency weight are both worse problems than they are in Docker.

## Decisions (settled via `/grilling`)

- **Process model**: the Worker process is retired. Job claiming/running moves in-process into the Nuxt server; CPU-heavy handlers (ffmpeg, ONNX inference) run off the main thread. This supersedes ADR 0002, whose stated reason for a second process — "the app is Nuxt on Node; the audio tooling is Python" — no longer holds once both are Node.
- **Sequencing**: no dual-worker coexistence in production. Each piece is built and verified independently (tests, or a dedicated validation ticket), then Python is deleted in one cutover ticket once every Job type is covered by the new runner.
- **Data directory**: user data (`akapela.db`, `tracks/`) stays at the data directory root; re-downloadable cache (vocal-separation model weights) moves to a `cache/` subtree. "Back up everything except `cache/`" becomes a rule instead of a hand-maintained exclude list.
- **yt-dlp**: ported to a TS wrapper shelling out to the standalone per-OS yt-dlp binary — the same calling pattern already used for ffmpeg, not a library dependency.
- **ffmpeg**: ported to a TS wrapper via a spawned subprocess against a real ffmpeg binary — a near 1:1 port of `audio.py`'s filter graphs. `node-av` was considered and rejected: its bundled ffmpeg build can't be confirmed to include `librubberband` (the GPL dependency ADR 0004 already committed to for the tempo/pitch filter), so it can't do the one thing that filter chain needs.
- **MDX-Net vocal separation**: the only genuinely hard port. `onnxruntime-node` replaces the ONNX Runtime call; the STFT windowing/chunking/overlap-add pipeline around it has to be reimplemented in TS. Validated in its own ticket, against a fixed test clip, before anything is wired to depend on it.
- **Backup/restore**: rides along this effort since the data-directory split makes it small. Sequenced *after* the Python cutover, so it's built and tested against the app's final architecture rather than a mid-migration one.

## Tickets

See `issues/`, numbered in dependency order. `01` and `02` have no blockers and can start immediately.

# 01: Separator interface, separate Job, and Stems on disk

**What to build:** The worker half of vocal removal. A `separate` Job takes a Track id, runs an MDX-Net vocal model over the Track's Backing Track, and writes two Stems next to it: `instrumental.wav` and `vocals.wav`, 44.1 kHz stereo WAV like everything else (ADR 0005). `backing.wav` is never touched, so switching back to the original is instant and lossless. Every call into the model sits behind a `Separator` Protocol in `worker/akapela_worker/separators.py`, shaped exactly like `SourceFetcher` in `sources.py` and for the same reason: the model is this phase's yt-dlp, and it must be swappable and fakeable without touching the job. The model file itself is downloaded on first use into `<dataDir>/models/`, never at startup and never into the image, so a self-hoster who never separates anything never pays for it and the cache survives `docker compose pull`.

**Blocked by:** nothing

**Status:** ready-for-agent

- [ ] `audio-separator` is a worker dependency, `uv sync`'d, and ADR 0008 records why it rather than Demucs
- [ ] `separators.py` defines a `Separator` Protocol and a `SeparationError` whose message is what the singer reads on the card, with the real MDX-Net implementation behind it, mirroring the shape of `sources.py`
- [ ] The model is fetched on first use into `<dataDir>/models/` and reused afterwards; a fetch failure raises `SeparationError` with a message naming the model and the network as the cause
- [ ] A `separate` job type exists, targets a Track id, and runs in the existing one-at-a-time queue with the existing states, the existing no-auto-retry rule, and the existing stale-job recovery
- [ ] The job writes `instrumental.wav` and `vocals.wav` into the Track directory at 44.1 kHz stereo and leaves `backing.wav` byte-identical
- [ ] Coarse progress steps are written to the job row: 10 started, 30 model ready, 85 Stems written, 100 done
- [ ] Re-running the job on a Track that already has Stems overwrites both files in place; a Track deleted mid-separation cleans up its orphaned files and fails the job rather than resurrecting the row, the way the import job already handles it
- [ ] Worker tests use a fake `Separator` writing fixture files and assert both Stems present, durations matching the Backing Track within tolerance, the error recorded on failure, the model-download failure message, and the deleted-mid-separation guard; the real model never runs in the suite

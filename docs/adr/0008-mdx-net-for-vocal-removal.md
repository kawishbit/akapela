# MDX-Net via audio-separator for vocal removal, not Demucs

Vocal removal runs an MDX-Net model on ONNX Runtime through `audio-separator` (MIT). The obvious alternative was Demucs, which is the better-known name and the one a future reader will wonder why we skipped. Demucs means PyTorch, and a CPU torch wheel plus its dependencies is several hundred megabytes in the Worker image — paid by every self-hoster, including the ones who never separate anything. ONNX Runtime is a fraction of that, and MDX-Net's vocal models are widely rated better than `htdemucs` for exactly this job, which is producing a clean instrumental rather than a balanced four-way split. Both are MIT, so ADR 0004's GPL-3.0 compatibility constraint holds either way. The cost accepted is a less mainstream dependency whose model weights come from a third-party host.

## Consequences

- Model weights are not baked into the image. The first separation Job downloads them into `<dataDir>/models/`, so the image stays small, the cache survives `docker compose pull`, and a self-hoster who never separates pays nothing.
- That download is a failure mode a self-hoster can hit offline. It surfaces as the Job's error on the Track and is retried by hand, never automatically — the same treatment a broken yt-dlp gets.
- Every call into the model sits behind a `Separator` interface, so swapping it later is one file. This is the same guard `SourceFetcher` gives yt-dlp, for the same reason: it is a third-party thing that will break or be superseded.
- Separation quality is never asserted in tests. The real model runs only in the manual checklist.

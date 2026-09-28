# 08: Using every core

**What to build:** Only the model call is multi-threaded today. The STFT, the inverse STFT, the float64↔float32 copies, and the overlap-add run on one thread while every other core waits, chunk after chunk (`server/lib/separators/`).

1. **The correlation harness, first.** A test separates a fixed reference Track (committed, or fetched into the test cache like the model) and compares each Stem's sample correlation against a stored reference output from today's code. It requires **≥ 0.999**. It's gated on the model being available, like the other real-model tests. It becomes the permanent guard from ADR 0008's amendment.
2. **Profile.** Measure how a Separation's time splits between the STFT, the model call, the inverse STFT, copying, and overlap-add, on a 4-minute Track, and record the numbers in Comments.
3. **Fix what the profile points at.** The expected candidates are to compute chunk *n+1*'s STFT on a worker thread while chunk *n* is in the model, and to keep the pipeline in float32. Moving the STFT into the ONNX graph is the alternative if the profile says the STFT dominates. Peak memory must stay inside compose's `memory: 2G` limit.

**Blocked by:** 01 (thread count now comes from the core limit)

**Status:** ready-for-agent

- [ ] The correlation harness exists and passes against today's code before anything changes
- [ ] Profile numbers before and after, recorded in Comments
- [ ] Correlation ≥ 0.999 on every Stem after the change
- [ ] Peak memory during a Separation stays under 2 GB
- [ ] Progress reporting (`onChunk`) is still accurate chunk by chunk
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

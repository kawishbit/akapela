# 05: Validate a TypeScript vocal-separation path against the current one

**What to build:** A standalone, repeatable check — not wired into any Job yet — that a TypeScript vocal-separation pipeline (`onnxruntime-node` running the same MDX-Net ONNX model, with a hand-rolled STFT/windowing/chunking/overlap-add pipeline standing in for what `audio-separator` currently does in torch around the model call) produces an Instrumental Stem equivalent to today's output on a fixed test clip. This is the ticket that says "the port is sound" before ticket 06 depends on it.

**Blocked by:** 01 (data directory split — the model weights this fetches belong in the new cache path)

**Status:** done

- [x] A script or test feeds the same audio clip through both the current Python/torch path and the new TS path
- [x] The two Instrumental Stems are compared by an objective measure (e.g. spectral difference or a standard separation-quality metric) against a documented threshold, not by ear alone
- [x] The model weights are fetched into the cache path from ticket 01
- [x] The comparison and its result are recorded in this ticket so a later reader doesn't have to re-run it to know whether the port is trustworthy

## Result

Built `server/lib/separators/stft.ts` (STFT/ISTFT) and `server/lib/separators/mdx-net.ts`
(chunking, overlap-add, the ONNX call via `onnxruntime-node`), following
`worker/akapela_worker/uvr_lib_v5/stft.py` and `mdx_separator.py` exactly, for
the Instrumental Stem only (the model's primary output; Vocals is ticket 06's
time-domain subtraction on top of this).

**Config**, read directly off the real, downloaded model rather than guessed
— its ONNX graph declares `[batch, 4, 3072, 256]` for both input and output,
and `Separator`'s own resolved `model_data` for it is
`n_fft=6144, dim_f=3072, dim_t=256, hop_length=1024, overlap=0.25` (`compensate=1.022`
applies only to Vocals). `n_fft=6144` is not a power of two, which ruled out
`fft.js`; `ndarray-fft` (Bluestein's algorithm) was verified independently
first — exact peak bin and magnitude on a known sine input, ~1e-10 round-trip
error on forward+inverse — before anything was built on top of it.

**Validation**: `scripts/validate-mdx-net-port.ts`, run by hand
(`pnpm tsx scripts/validate-mdx-net-port.ts <model.onnx> <clip.wav> [reference.wav]`),
feeds the same synthetic stereo clip (3s, two sine tones, via
`fetch_model`+`separate()` for the Python side, `MdxNetModel.separateInstrumental`
for the TS side) through both paths and reports a Pearson correlation between
them, sample for sample.

**Threshold**: correlation ≥ 0.95 per channel.
**Result**: left 0.9990, right 0.9994, RMS 0.01036 (TS) vs 0.01076 (Python) —
comfortably clears it. The remaining gap is expected numerical drift (a
different FFT implementation, minor edge handling differences in
reflect-padding/windowing), not a structural mismatch — confirmed separately
by `tests/unit/separators/mdx-net.test.ts`, which reconstructs a signal
closely through the chunking/overlap-add math alone using a fake identity
model (no ONNX involved), isolating that logic from the model itself.

**Not yet covered**: the Vocals Stem (secondary output, ticket 06), and
validation against real (non-synthetic) music — the synthetic clip was enough
to validate the DSP pipeline's correctness but says nothing about separation
*quality* on real audio, which was never this ticket's question.

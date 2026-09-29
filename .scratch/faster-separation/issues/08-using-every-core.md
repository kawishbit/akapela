# 08: Using every core

**What to build:** Only the model call is multi-threaded today. The STFT, the inverse STFT, the float64↔float32 copies, and the overlap-add run on one thread while every other core waits, chunk after chunk (`server/lib/separators/`).

1. **The correlation harness, first.** A test separates a fixed reference Track (committed, or fetched into the test cache like the model) and compares each Stem's sample correlation against a stored reference output from today's code. It requires **≥ 0.999**. It's gated on the model being available, like the other real-model tests. It becomes the permanent guard from ADR 0008's amendment.
2. **Profile.** Measure how a Separation's time splits between the STFT, the model call, the inverse STFT, copying, and overlap-add, on a 4-minute Track, and record the numbers in Comments.
3. **Fix what the profile points at.** The expected candidates are to compute chunk *n+1*'s STFT on a worker thread while chunk *n* is in the model, and to keep the pipeline in float32. Moving the STFT into the ONNX graph is the alternative if the profile says the STFT dominates. Peak memory must stay inside compose's `memory: 2G` limit.

**Blocked by:** 01 (thread count now comes from the core limit)

**Status:** done

- [x] The correlation harness exists and passes against today's code before anything changes
- [x] Profile numbers before and after, recorded in Comments
- [x] Correlation ≥ 0.999 on every Stem after the change
- [x] Peak memory during a Separation stays under 2 GB
- [x] Progress reporting (`onChunk`) is still accurate chunk by chunk
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29, the harness: `tests/unit/separators/reference-correlation.test.ts`, on a synthesized 12 s song (`tests/fixtures/separation/`). Its reference Stems were made by the code as it stood before this ticket changed anything, and it passed against that code on the CPU and on DirectML before anything moved. It runs when the model is in `data/cache/models/` or `AKAPELA_TEST_MODELS_DIR`, and on a GPU backend too with `AKAPELA_TEST_ACCELERATOR=dml:1`.
- **Profile, before:** a 4-minute Track, `Inst_Main`, 52 chunks, 16 threads, on this machine:

  | Run | Total | STFT | Model call | Inverse STFT | Copies and overlap-add | Peak RSS |
  | --- | --- | --- | --- | --- | --- | --- |
  | CPU | 202.5 s | 67.0 s | 60.7 s | 72.5 s | 2.3 s | 1,087 MB |
  | DirectML | 145.7 s | 65.9 s | 9.5 s | 68.2 s | 2.1 s | 1,282 MB |

  The STFT was two thirds of a Separation, and it was `ndarray-fft`'s Bluestein algorithm: `nFft` is never a power of two, and each 5120-point frame cost about 2.5 ms.
- **The fix:** `fft.ts`, a mixed-radix (4/2/3/5) Stockham FFT. Every catalog `nFft` factors into 2s, 3s and 5s. Each frame's left and right channels share one complex transform. It matches the old STFT to about 1e-11 relative, forward and inverse, and `ndarray`/`ndarray-fft` are gone from both installs.
- **Profile, after:**

  | Run | Total | STFT | Model call | Inverse STFT | Copies and overlap-add | Peak RSS |
  | --- | --- | --- | --- | --- | --- | --- |
  | CPU, `Inst_Main` | 68.8 s | 4.1 s | 58.3 s | 3.7 s | 2.6 s | 1,040 MB |
  | CPU, `Kim_Vocal_2` | 101.9 s | 7.6 s | 84.5 s | 7.1 s | 2.6 s | 1,061 MB |
  | DirectML, `Inst_Main` | 10.2 s | 2.7 s | 3.1 s | 2.7 s | 1.7 s | 1,234 MB |
  | DirectML, `Kim_Vocal_2` | 17.4 s | 5.5 s | 4.6 s | 5.4 s | 1.9 s | 1,287 MB |

  That's 2.9× faster on the CPU and 14× on DirectML. On the CPU, 85 % of the time is now the model call, which already uses as many threads as the core limit allows. That's the "using every core" the ticket asked for.
- **Not done, and why:** overlapping chunk n+1's STFT with chunk n's model call. It was tried and gained under a second, because onnxruntime-node's `run` is a synchronous native call on the calling thread (`setImmediate` around `session.run`). Overlap would need a worker thread, for at most the ~8 s of STFT left in a 69 s CPU run. Moving the pipeline to float32 wasn't needed either: peak memory is at most 1.29 GB, inside compose's 2 GB.
- **Found along the way:** this port has always fed the model each frame's complex conjugate (`ndarray-fft` uses e^(+i), `torch.stft` e^(−i)). The new FFT keeps that, since this ticket must not change the Stems. Whether to switch is ticket 09.
- The correlation harness passes after the change on the CPU and on DirectML adapter 1. So does the full separators suite, including `onChunk`'s chunk-by-chunk reports.

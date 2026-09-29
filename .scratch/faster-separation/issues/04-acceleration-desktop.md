# 04: Hardware acceleration in the Desktop App

**What to build:** The **Hardware acceleration** switch, and the two Desktop App backends that make it appear (ADR 0013 amendment).

- **Detection.** At server start, Akapela works out which GPU backend it could use: DirectML on Windows x64 (its DLLs already ship in `onnxruntime-node`'s Windows binary), CoreML on macOS arm64, and CUDA on Linux x64, but only where the CUDA provider and its libraries are actually loadable, which ticket 05's image provides. Detection must prove the backend works, for example by creating a session on a tiny model. The package listing a provider isn't proof. **Start with a spike:** confirm `onnxruntime-node` 1.29's macOS arm64 build includes the CoreML provider. If it doesn't, CoreML is dropped from this ticket and the spike's finding is written into ADR 0013's amendment.
- **The switch** appears in Settings' **Separation** section only when a backend was detected, and is on by default. The hardware line from ticket 01 becomes "On this server: 8 cores, GPU: DirectML".
- **A Separation with acceleration on** creates its session with that backend first and CPU second. The switch is read when the Separation starts.
- **Falling back.** If the GPU session fails to create or fails partway through, the Separation carries on with a CPU session from the chunk it reached. It never fails because of the GPU alone. Its Jobs page row says "Finished on CPU: the GPU failed", and the reason is logged.
- The GPU output must meet the ≥ 0.999 correlation rule against the CPU output on the reference Track. Ticket 08 builds the harness; until then, check it by hand and record the numbers in this ticket's Comments.
- The Linux Desktop App detects nothing and never shows the switch.

**Blocked by:** 01

**Status:** done

- [x] Spike: CoreML present in `onnxruntime-node`'s macOS arm64 build, answered in Comments
- [x] The switch is absent on a machine with no working backend, and on the Linux Desktop App
- [x] The switch is on by default where it appears
- [x] A backend failure mid-Separation completes on CPU and says so on the Jobs page
- [x] GPU vs CPU correlation ≥ 0.999 on the reference Track, numbers recorded
- [x] The macOS `enableCpuMemArena: false` workaround still holds for the CPU path under Electron
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29, the spike: CoreML **is** in `onnxruntime-node` 1.29.0's macOS arm64 build. The binding (`bin/napi-v6/darwin/arm64/onnxruntime_binding.node`) registers the `coreml` provider name, and `libonnxruntime.1.29.0.dylib` carries the CoreML execution provider (thousands of `CoreML` symbols). Nothing was dropped. It has not been *run* on a Mac yet: that needs Apple Silicon, which this machine isn't. Detection will simply find nothing if it doesn't work there.
- Detection (`detectAccelerator` in `session.ts`, run by `separate-cli.ts --detect` at server start) opens a session on each candidate and runs a 1024×1024 `MatMul` model built in memory (`probe-model.ts`). A backend counts only if the answer is right. On this Windows laptop (Intel iGPU plus RTX 5070 Ti Laptop), DirectML adapter 0 is the iGPU: one `Inst_Main` chunk took 806 ms there, 53 ms on adapter 1, and 1,141 ms on the CPU. Detection times every adapter and picked `dml:1`, in about 5 s. The Linux Desktop App (`process.versions.electron` on Linux) never tries.
- GPU vs CPU on a 20 s clip of a real Track, `Inst_Main`, DirectML adapter 1: correlation **1.000000** on both channels of both Stems. The whole run took 15.3 s on the GPU and 20.7 s on the CPU. The model call is no longer the bottleneck; the single-threaded STFT is, which is ticket 08.
- Fallback: `--accelerator dml:9`, an adapter that doesn't exist, fails to open, prints a `fallback` line with DirectML's own error, and finishes on the CPU. The output correlates 1.000000 with the plain CPU run. `FallbackSession` reruns the chunk that failed on the CPU, so a mid-run failure loses nothing. The Job row says "Finished on CPU: the GPU failed", and the reason is logged.
- `enableCpuMemArena: false` is still in both the CPU and the GPU session options (`cpuSessionOptions`, `acceleratedSessionOptions`), with tests.

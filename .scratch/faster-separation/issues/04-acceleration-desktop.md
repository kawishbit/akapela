# 04: Hardware acceleration in the Desktop App

**What to build:** The **Hardware acceleration** switch, and the two Desktop App backends that make it appear (ADR 0013 amendment).

- **Detection.** At server start, Akapela works out which GPU backend it could use: DirectML on Windows x64 (its DLLs already ship in `onnxruntime-node`'s Windows binary), CoreML on macOS arm64, and CUDA on Linux x64, but only where the CUDA provider and its libraries are actually loadable, which ticket 05's image provides. Detection must prove the backend works, for example by creating a session on a tiny model. The package listing a provider isn't proof. **Start with a spike:** confirm `onnxruntime-node` 1.29's macOS arm64 build includes the CoreML provider. If it doesn't, CoreML is dropped from this ticket and the spike's finding is written into ADR 0013's amendment.
- **The switch** appears in Settings' **Separation** section only when a backend was detected, and is on by default. The hardware line from ticket 01 becomes "On this server: 8 cores, GPU: DirectML".
- **A Separation with acceleration on** creates its session with that backend first and CPU second. The switch is read when the Separation starts.
- **Falling back.** If the GPU session fails to create or fails partway through, the Separation carries on with a CPU session from the chunk it reached. It never fails because of the GPU alone. Its Jobs page row says "Finished on CPU: the GPU failed", and the reason is logged.
- The GPU output must meet the ≥ 0.999 correlation rule against the CPU output on the reference Track. Ticket 08 builds the harness; until then, check it by hand and record the numbers in this ticket's Comments.
- The Linux Desktop App detects nothing and never shows the switch.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Spike: CoreML present in `onnxruntime-node`'s macOS arm64 build, answered in Comments
- [ ] The switch is absent on a machine with no working backend, and on the Linux Desktop App
- [ ] The switch is on by default where it appears
- [ ] A backend failure mid-Separation completes on CPU and says so on the Jobs page
- [ ] GPU vs CPU correlation ≥ 0.999 on the reference Track, numbers recorded
- [ ] The macOS `enableCpuMemArena: false` workaround still holds for the CPU path under Electron
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

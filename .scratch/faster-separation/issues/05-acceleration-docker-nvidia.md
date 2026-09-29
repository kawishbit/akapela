# 05: Hardware acceleration in Docker, on NVIDIA

**What to build:** A way for a compose install to use an NVIDIA GPU, without the default image changing at all.

- A `gpu` build target in the existing `Dockerfile`, built on a CUDA 12 + cuDNN 9 runtime base, where `onnxruntime-node`'s CUDA provider is installed (`--onnxruntime-node-install=cuda12`) and loads. The default target stays exactly as it is and never pulls CUDA.
- A `docker-compose.gpu.yml` override that selects the `gpu` target and reserves the GPU (`deploy.resources.reservations.devices` with `driver: nvidia`). It's run as `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up`.
- `docs/self-hosting.md` gains a GPU section covering the NVIDIA Container Toolkit on Linux, WSL2 on Windows, why a Mac can't do this, and how to check it worked: the Settings hardware line says "GPU: CUDA". `docs/troubleshooting.md` gains the common failure, where the toolkit is missing and the switch never appears.
- Ticket 04's detection makes the switch appear. Nothing here is Settings UI.

**Blocked by:** 04

**Status:** done

- [x] The default `docker compose up` image is unaffected by the new target
- [x] With the override on an NVIDIA host, Settings shows "GPU: CUDA" and a Separation runs on it
- [ ] With the override on a host without the toolkit, compose fails with the toolkit's own error, and the docs name it
- [x] `docs/self-hosting.md` and `docs/troubleshooting.md` updated
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29: **The provider is CUDA 13, not 12.** `onnxruntime-node` 1.29's `--onnxruntime-node-install=cuda12` fetches `Microsoft.ML.OnnxRuntime.Gpu.Linux`, whose `libonnxruntime_providers_cuda.so` links `libcudart.so.13` and `libcublasLt.so.13` (`ldd`). The first build, on `nvidia/cuda:12.9.1-cudnn-runtime-ubuntu24.04`, detected no GPU for exactly that reason. The `gpu` target is now `nvidia/cuda:13.0.1-cudnn-runtime-ubuntu24.04`, which needs a host driver of 580 or newer; the docs say so. ADR 0013's amendment is corrected, and detection now logs why each backend failed when none works, which is what should have surfaced this in the first place.
- Checked on this machine, which has an RTX 5070 Ti Laptop GPU, driver 610.47, and Docker Desktop on WSL2:
  - With the override, Settings answers `hardware: { cores: 8, gpu: "CUDA" }` with the switch on.
  - The reference song separated in the container with `--accelerator cuda` correlates 0.999993 to 0.999999 with the reference Stems on every channel.
  - The default `docker compose build` builds the `default` stage (`FROM runtime`), with no CUDA in its log. The image is 785 MB against the GPU image's 6.0 GB, has no `/usr/local/cuda`, and its onnxruntime folder holds only `libonnxruntime.so.1` and the binding.
- **Not reproduced:** a host without the NVIDIA toolkit, since this one has it. The docs name Docker's own error for that case (`could not select device driver "nvidia" with capabilities: [[gpu]]`), give a `docker run --gpus all … nvidia-smi` check, and point to the toolkit install.
- Along the way, the default image build was failing at `pnpm install` on `main`: the pnpm 12 migration had allowed `better-sqlite3`'s node-gyp build in a stage with no Python. That's fixed in its own commit, `fix(docker)`.

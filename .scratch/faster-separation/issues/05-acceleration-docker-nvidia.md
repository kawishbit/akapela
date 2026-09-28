# 05: Hardware acceleration in Docker, on NVIDIA

**What to build:** A way for a compose install to use an NVIDIA GPU, without the default image changing at all.

- A `gpu` build target in the existing `Dockerfile`, built on a CUDA 12 + cuDNN 9 runtime base, where `onnxruntime-node`'s CUDA provider is installed (`--onnxruntime-node-install=cuda12`) and loads. The default target stays exactly as it is and never pulls CUDA.
- A `docker-compose.gpu.yml` override that selects the `gpu` target and reserves the GPU (`deploy.resources.reservations.devices` with `driver: nvidia`). It's run as `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up`.
- `docs/self-hosting.md` gains a GPU section covering the NVIDIA Container Toolkit on Linux, WSL2 on Windows, why a Mac can't do this, and how to check it worked: the Settings hardware line says "GPU: CUDA". `docs/troubleshooting.md` gains the common failure, where the toolkit is missing and the switch never appears.
- Ticket 04's detection makes the switch appear. Nothing here is Settings UI.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The default `docker compose up` image is unaffected by the new target
- [ ] With the override on an NVIDIA host, Settings shows "GPU: CUDA" and a Separation runs on it
- [ ] With the override on a host without the toolkit, compose fails with the toolkit's own error, and the docs name it
- [ ] `docs/self-hosting.md` and `docs/troubleshooting.md` updated
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

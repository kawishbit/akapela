# Separation always runs on the server, never in the browser

_Decided, not yet built as far as acceleration goes. See `ROADMAP.md`, item 1, and the amendment below._

Most people run Akapela with Docker on a small machine, so Separation is slow exactly where it's used most. One way around that would be to run the model in the singer's browser, with ONNX Runtime Web and WebGPU, on the laptop's GPU, and upload the Stems. We're not doing that. Separation stays a server Job, and speeding it up happens on the server: faster CPU code first, then an opt-in GPU image for Docker and GPU support in the Desktop App.

The browser route only helps a singer who separates one song and keeps the tab open until it's done. It does nothing for a Spotify playlist import, which queues dozens of Separations to run while nobody is watching, and it would mean keeping the same model working in two runtimes, with two sets of failures, for that one case.

## Consequences

- A PWA or a phone is only a window onto the server. "Faster on the web" always means "faster on the machine hosting Akapela".
- Docker on macOS can't reach the GPU from a container, so a Mac self-hoster stays on CPU. The Desktop App is the answer for a Mac with a GPU worth using.

## Amendment: how acceleration reaches the server

Settings describe **the machine hosting Akapela**, never the device showing the page. A Connected Desktop App on a laptop with a good GPU, pointed at a compose install with none, gets no acceleration switch, and its core limit ranges over the server's cores. The Settings page says whose hardware it is describing, for example "On this server: 8 cores, no GPU found".

- **Hardware acceleration is a single switch,** shown only when a usable backend is found, and on by default when it is. Akapela picks the backend itself: CUDA in the GPU image, DirectML in the Windows Desktop App, CoreML in the Apple Silicon Desktop App. If the GPU fails partway through, the Separation carries on on CPU, and its row on the Jobs page says so. It doesn't fail.
- **NVIDIA in Docker is opt-in through a `gpu` build target** in the existing Dockerfile and a `docker-compose.gpu.yml` override that selects it and reserves the GPU. The default image never contains CUDA: `onnxruntime-node`'s CUDA provider needs the CUDA 12 runtime and cuDNN 9 inside the image, which adds several GB, and the host needs the NVIDIA Container Toolkit. WSL2 on Windows works the same way.
- **The rest stay on CPU.** AMD and Intel in Docker would need an ONNX Runtime we build ourselves, since `onnxruntime-node` ships no ROCm or OpenVINO build. Docker on macOS can't reach the GPU at all. DirectML exists only in the Windows package. The Linux Desktop App would need CUDA and cuDNN bundled into the installer (several GB) or rely on whatever the system has, so it stays CPU-only, and a Linux singer with an NVIDIA card runs the GPU compose instead.
- **A Separation never takes the whole machine.** A CPU core limit (default: all cores minus one, minimum 1) caps its thread count, and the Separation subprocess always runs at lowered OS priority. It shares the machine with the server answering requests and, in the Desktop App, with the browser recording a Take, and a saturated CPU is what makes a Take crackle. There is no GPU limit: only CUDA can cap anything, and only memory.
- **When settings take effect.** The Separation Model is fixed when a Separation is asked for, because it decides what the Stems will be. Acceleration and the core limit are read when the Separation starts running, because they only decide how fast it goes.

# Separation always runs on the server, never in the browser

_Decided, not yet built as far as acceleration goes. See `ROADMAP.md`, item 3._

Most people run Akapela with Docker on a small machine, so Separation is slow exactly where it's used most. One way around that would be to run the model in the singer's browser, with ONNX Runtime Web and WebGPU, on the laptop's GPU, and upload the Stems. We're not doing that. Separation stays a server Job, and speeding it up happens on the server: faster CPU code first, then an opt-in GPU image for Docker and GPU support in the Desktop App.

The browser route only helps a singer who separates one song and keeps the tab open until it's done. It does nothing for a Spotify playlist import, which queues dozens of Separations to run while nobody is watching, and it would mean keeping the same model working in two runtimes, with two sets of failures, for that one case.

## Consequences

- A PWA or a phone is only a window onto the server. "Faster on the web" always means "faster on the machine hosting Akapela".
- Docker on macOS can't reach the GPU from a container, so a Mac self-hoster stays on CPU. The Desktop App is the answer for a Mac with a GPU worth using.

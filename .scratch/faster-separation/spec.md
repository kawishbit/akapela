# Spec: Separation — models, acceleration, storage

Status: ready-for-agent

`ROADMAP.md`, item 1. Capitalised terms (Separation, Separation Model, Stems, Track, Take, Job, Lane, Audio Format, Desktop App, Connected) are defined in `CONTEXT.md`. Decisions are recorded in ADR 0016 (Audio Format, superseding 0005), ADR 0013's amendment (acceleration and resources), and ADR 0008's amendment (the Separation Model catalog and the correlation rule).

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they should land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [A core limit, and a Separation that yields](issues/01-core-limit-and-priority.md) | done | — |
| 02 | [The Separation Model catalog](issues/02-separation-model-catalog.md) | done | — |
| 03 | [Separate again with another Separation Model](issues/03-separate-again.md) | done | 02 |
| 04 | [Hardware acceleration in the Desktop App](issues/04-acceleration-desktop.md) | done | 01 |
| 05 | [Hardware acceleration in Docker, on NVIDIA](issues/05-acceleration-docker-nvidia.md) | done | 04 |
| 06 | [Audio Format: FLAC](issues/06-audio-format-flac.md) | done | — |
| 07 | [Audio Format: MP3](issues/07-audio-format-mp3.md) | done | 06 |
| 08 | [Using every core](issues/08-using-every-core.md) | done | 01 |
| 09 | [The STFT's sign convention](issues/09-stft-sign-convention.md) | needs-triage | — |

01, 02, and 06 are independent starting points. 08 lands last on purpose. It's the one change that alters the separation arithmetic itself, and it comes after the settings people asked for.

## Problem Statement

A Separation takes minutes per song, and a singer has no say over any of it: one model, however many threads ONNX Runtime picks, never a GPU, and three WAVs of about 40 MB each stored per Track. A singer with a good GPU can't use it. A singer with a small disk can't make a Playlist Import fit. A singer who wants cleaner Stems than `Inst_Main` gives can't ask for them. And a Separation running while someone records a Take on the same machine competes with that recording for the CPU.

## Solution

A **Separation** section and a **Storage** section in Settings, describing the machine hosting Akapela:

- **Separation Model**: a curated MDX-Net list with a one-line description of each (speed, quality, frequency cutoff). The default is `Inst_Main`.
- **CPU cores**: a limit on the cores a Separation may use, from 1 up to every core, defaulting to all but one. A Separation always runs at lowered OS priority.
- **Hardware acceleration**: one switch, on by default, shown only when a usable GPU backend exists.
- **Audio Format**: WAV (the default), FLAC, or MP3, for the Backing Track master and Stems.

A line says whose hardware this is: "On this server: 8 cores, no GPU found." Connected, that's the server's hardware, not the laptop's.

## Decisions

- **Settings describe the machine hosting Akapela** (ADR 0013). A Connected Desktop App on a laptop with a GPU, pointed at a server with none, shows no acceleration switch.
- **The Separation Model is fixed when a Separation is asked for.** A Playlist Import that queued 30 Separations keeps the model it was asked for, even if the default changes while they wait. The Jobs page shows each row's model. **Acceleration and the core limit are read when each Separation starts**, because they only change how fast it runs, not what it produces.
- **The Separation Model is recorded with the Stems** it produced, and the Track page shows it.
- **Each model downloads into `cache/` the first time a Separation needs it**, as part of that Separation's Job, with the existing download-failure handling. Nothing is bundled into the image or the installer.
- **Only MDX-Net models.** Every other family needs its own pipeline. Roformer is under Explore in `ROADMAP.md`.
- **One acceleration switch, not a backend picker.** Akapela picks CUDA, DirectML, or CoreML itself. A GPU failure partway through falls back to CPU for the rest of that Separation, and the Jobs page row says "Finished on CPU: the GPU failed".
- **No GPU limit.** Only CUDA can cap anything, and only memory.
- **Core limit: default all cores minus one, minimum 1.** Lowered OS priority protects a Take being recorded on the same machine while costing an idle machine almost nothing.
- **Docker GPU is NVIDIA only**, through a `gpu` build target and `docker-compose.gpu.yml`. The default image never contains CUDA. **The Linux Desktop App is CPU-only.**
- **Audio Format applies to files written after it changes.** A mixed library is fine. Converting the old files is under Later in `ROADMAP.md`.
- **MP3 is 320 kbps CBR, and isn't offered until a test proves it stays aligned** (ADR 0016).
- **Speed-ups must keep each Stem's sample correlation ≥ 0.999** against today's output on a fixed reference Track (ADR 0008 amendment).
- **Vocabulary.** **Separation Model** and **Audio Format** are in `CONTEXT.md`.

## Out of scope

- Batching chunks into one model call on a GPU, which is under Explore.
- AMD (ROCm) and Intel (OpenVINO), in any form.
- A GPU inside Docker on macOS, which isn't possible.
- Converting an existing library to another Audio Format.
- Separation Models outside MDX-Net.
- A speed target in minutes. How fast a Separation is depends on the hardware, and the singer now controls the hardware side.
- Localisation: English strings, until `ROADMAP.md` item 3 lands.

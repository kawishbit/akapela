# Spec: Desktop App — Akapela as a download

Status: ready-for-human

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [The Worker is gone: fix the glossary](issues/01-glossary-worker-is-gone.md) | done | — |
| 02 | [External tools behind one seam](issues/02-tool-paths-behind-one-seam.md) | done | — |
| 03 | [The `desktop/` package and a window over a running server](issues/03-desktop-package-and-window.md) | ready-for-human | — |
| 04 | [Electron starts and supervises the server](issues/04-electron-supervises-the-server.md) | done | 02, 03 |
| 05 | [Bundled ffmpeg and the installers](issues/05-bundled-ffmpeg-and-installers.md) | ready-for-human | 02, 03 |
| 06 | [yt-dlp fetched, cached, and updatable](issues/06-yt-dlp-fetched-and-updatable.md) | done | 02, 04 |
| 07 | [YouTube imports without Node on PATH](issues/07-youtube-without-node-on-path.md) | done | 06 |
| 08 | [Where the library lives, and moving it](issues/08-library-location.md) | ready-for-human | 04 |
| 09 | [Building, signing, and shipping a release](issues/09-build-sign-and-release.md) | ready-for-human | 05 |
| 10 | [Drop an audio file on the window](issues/10-drop-to-import.md) | done | 03 |
| 11 | [Docs, ADRs, and the manual pass](issues/11-docs-adrs-and-manual-pass.md) | ready-for-human | 09 |

Everything landed. Tickets 01, 02, 04, 06, 07, and 10 are finished outright; the five marked `ready-for-human` are complete in code and blocked on things only a person or another machine can do — opening the window, building an installer, signing on a Mac, and the manual pass. Each ticket's comments say exactly what is unverified and how to verify it. Two open questions are worth reading before a release: `darwin-arm64` has no pinned ffmpeg that can be confirmed to carry librubberband (ticket 05), and the bundled ffmpeg/ffprobe are 164 MB each (ticket 05 again).

## Problem Statement

Akapela's README opens with `git clone`, then `docker compose up -d`, then "you'll also need Git, just to grab the code above." For the person this app is for — someone who wants to sing — that is three tools and a terminal before a single note. Docker Desktop alone is a multi-gigabyte install with a licence question attached for anyone at a company.

The self-hosting path is not wrong. It is right for the machine in the cupboard that serves the whole house, and nothing here takes it away. But it is the *only* path, and it is the wrong one for the far more common case: one person, one laptop, wanting to sing tonight.

There is a second, quieter problem the container cannot fix. When YouTube changes and yt-dlp breaks, the README's answer is `git pull && docker compose up -d --build`. That answer only exists for someone who cloned a repo. Anyone who downloaded an app has no repo to pull, and importing from YouTube — the app's main way of getting a song in — simply stops working until the next release.

## Solution

Ship Akapela as a downloadable desktop app: Windows and macOS installers, an AppImage for Linux if it comes free with the others. Open it, and you are on the library screen.

The desktop app is **the same app**, not a second one. Electron's main process starts the existing Nitro server on a loopback port and points a window at it. Every API route, every Job, the range-request streaming that lets the browser seek within a Backing Track, the AudioWorklet engines, the whole test suite — untouched, and still exercised by `pnpm test`. The shell is thin on purpose (ADR 0009): almost every change to Akapela still belongs in the Nuxt app, and the Electron directory should stay small enough to read in one sitting.

`docker compose up` remains a first-class, documented path for the always-on, sing-from-any-device case. Both read the same data directory layout and the same `akapela.db`, so a backup archive from one restores into the other, and a desktop app can be pointed straight at a folder a compose instance built.

The tool problem is solved asymmetrically, and the asymmetry is the point (ADR 0010). `ffmpeg` and `ffprobe` are stable, load-bearing for every import and every Mix, and are bundled into the installer. `yt-dlp` breaks every few months by design — it is chasing a moving target — so it is fetched on first use into the data directory, cached the way the separation model already is, and refreshed by an **Update yt-dlp** button in Settings. The breakage that today needs a git pull and a rebuild becomes one click.

## Decisions

Settled during planning, with the reasoning that is worth keeping:

- **Wrap the server, don't absorb it.** Rejected: moving `server/lib/` into the main process and replacing HTTP with IPC. It breaks range-request seeking on the Backing Track, breaks audio decoding through `/api/tracks/:id/backing`, breaks all sixteen files in `tests/api/`, and forks the codebase in two for no gain. ADR 0009.
- **Native audio is out of scope.** No ASIO/WASAPI/CoreAudio path, no second audio engine outside the renderer. Recording latency is already handled by the Review screen's nudge (ADR 0006), and "auto latency calibration" is its own roadmap line.
- **Loopback only, no auth.** `127.0.0.1` on a persisted port. The absent authentication the README warns about is a deliberate LAN trade-off in a container; on a laptop on public wifi it is not, and binding loopback makes the question disappear rather than answering it. Anyone wanting network access runs compose.
- **The port is persisted, not allocated per launch.** `localStorage` is keyed by origin, and four per-device settings live there — output volume, theme, latency nudge, and chosen microphone. A fresh port each launch is a fresh origin, which would silently reset all four every time.
- **Electron main is the supervisor.** `POST /api/backup/restore` deliberately exits the process and relies on something outside to bring it back; compose's `restart: unless-stopped` does that today and `pnpm dev` notably does not. Electron restarting the child makes restore work on the desktop, and better than it works in the dev loop.
- **No auto-updater in v1.** A version check that links to the Releases page. electron-updater is real machinery with real failure modes for a first release nobody has yet installed.
- **macOS is signed and notarized; Windows is not, initially.** An unsigned macOS build is refused outright, not warned about. Windows SmartScreen warns and can be clicked through.
- **No e2e harness.** The logic worth testing is pure and goes in the existing vitest suite; the shell that is left is thinner than a Playwright rig would be.

## User Stories

### Getting it running

1. As a singer with no Docker and no terminal, I want to download an installer, open it, and be on the library screen, so that nothing stands between me and singing.
2. As a singer, I want the app to remember its window size, my theme, my volume, my microphone, and my latency nudge between launches, so that it behaves like an app rather than a fresh browser tab.
3. As a self-hoster, I want `docker compose up -d` to keep working exactly as documented, so that the machine serving my whole house is unaffected.
4. As someone who already ran Akapela in Docker, I want to point the desktop app at that data folder and see my library, so that switching does not mean re-importing everything.

### Keeping it working

5. As a singer, I want YouTube imports to keep working when YouTube changes, without pulling a repo or rebuilding anything, so that the app does not quietly rot.
6. As a singer, I want to see that vocal removal and Mix rendering still work the same way they do in the container, so that the desktop app is not a lesser version.
7. As a singer, I want restoring a backup to bring the app back on its own, so that the restore flow finishes instead of leaving me at a dead page.

### Not doing

8. As a maintainer, I want the Electron code to stay thin enough that a change to Akapela almost never touches it, so that shipping a desktop app does not double the cost of every future feature.

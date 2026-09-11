# 11: Docs, ADRs, and the manual pass

**What to build:** The record of why the desktop app is shaped the way it is, and the README restructure that makes the download the front door.

This lands **last, gated on a real downloadable artifact from ticket 09**, so the README never promises a link that 404s.

**Two ADRs**, and only two. The bar is: hard to reverse, surprising without context, and the result of a genuine trade-off.

- **ADR 0009 — Electron wraps the server rather than absorbing it.** A future reader will absolutely ask why a desktop app runs an HTTP server and talks to itself over TCP. Moving `server/lib/` into the main process and replacing HTTP with IPC was a real alternative; it was rejected because it breaks range-request seeking within a Backing Track, breaks decoding through `/api/tracks/:id/backing`, breaks all sixteen files in `tests/api/`, and forks the codebase in two. Record the loopback-only binding and the persisted port here too, with the `localStorage`-is-keyed-by-origin reason the port is persisted, since that is the non-obvious part.
- **ADR 0010 — ffmpeg bundled, yt-dlp fetched.** The asymmetry is the surprising part. One is stable and load-bearing for every import and every Mix; the other chases a moving target, breaks quarterly, and belongs to a user who has no repo to pull. Record that the desktop app therefore gains an update button the container cannot have.

**No ADR** for the port-persistence mechanics on their own, the window chrome, the signing choices, or the data-directory default. All reversible in an afternoon, none surprising.

**`CONTEXT.md` gains one term**, in the shape the existing Development entries use — **Desktop App**: the packaged Akapela you download and open on one machine; the same app compose serves, in a window of its own. _Avoid_: Electron app, native app, client. Nothing else. "Shell", "main process", and "renderer" are implementation, and the glossary stays a glossary.

The README restructure follows from the whole point of the effort: if the desktop app exists to remove Docker as the price of entry, a README opening with `git clone` contradicts it.

**Blocked by:** 09 (a release has to exist first)

**Status:** ready-for-human

- [x] ADR 0009 and ADR 0010 are written in the shape the existing ADRs use, including the alternatives that were rejected and why
- [x] `CONTEXT.md` gains **Desktop App** and nothing else
- [x] README "Running it" leads with downloading the installer; compose moves into a "Run it on a server" section keeping every word it has, framed as the always-on, sing-from-any-device path
- [x] The README says which platforms are signed and what a Windows user will see the first time, and that a backup archive moves between the desktop app and a compose instance in either direction
- [x] The "When YouTube imports break" section gains the desktop answer — the Update yt-dlp button — beside the existing rebuild instructions
- [x] The Roadmap's "A desktop app (Electron)" line is ticked
- [x] `CLAUDE.md` gains a short third section: Aspire for developing the app, compose for what self-hosters run, `desktop/` for the shell, with the note that the shell is deliberately thin and almost every change still belongs in the Nuxt app
- [x] `AGENTS.md` covers running the desktop shell against a live dev server, and the fact that `desktop/` is installed and run from inside its own directory because there is no pnpm workspace
- [ ] A manual pass on both platforms, recorded in this ticket's comments: import from a file and from YouTube, record a Take with a real microphone, render and download a Mix, separate a Track, restore a backup, and point the app at a compose-built library

## Comments

Written. The one thing this ticket was gated on — a real downloadable artifact from ticket 09 — does not exist yet, so the README's download link points at `releases/latest`, which will 404 until someone tags a release. Worth knowing before this is called finished.

- **ADR 0009 — Electron wraps the server rather than absorbing it.** Records the four reasons absorbing it was rejected (range-request seeking, decoding through `/api/tracks/:id/backing`, all sixteen files in `tests/api/`, and forking the codebase), the loopback-only binding, and the persisted port with the `localStorage`-is-keyed-by-origin reason, which is the non-obvious part. Also records that `better-sqlite3` and `onnxruntime-node` are both N-API and need no `@electron/rebuild`, so nobody spends a day on it.
- **ADR 0010 — ffmpeg bundled, yt-dlp fetched.** The asymmetry and why it is the point, the pinned-with-checksums difference from the Dockerfile's `latest`, the `gpl`-not-`lgpl` constraint, the licence obligation, and the `--js-runtimes node:<Electron>` trick that cost nothing extra to ship.
- `CONTEXT.md` gained **Desktop App** and nothing else. "Shell", "main process", and "renderer" stayed out — they are implementation.
- README now leads with the download. Compose moved under **Run it on a server**, keeping every word it had, framed as the always-on, sing-from-any-device path. The signing situation and the SmartScreen click-through are written out, and so is the fact that a backup archive moves between the two in either direction — plus that the desktop app can be pointed straight at a folder Docker built.
- **When YouTube imports break** now has both answers: the Update yt-dlp button for the download, the rebuild for Docker.
- The Roadmap's desktop line is ticked.
- `CLAUDE.md` is a symlink to `AGENTS.md` in this repo, so both of this ticket's last two boxes landed in one file: "Two ways to run it" became **three**, with the note that the shell is deliberately thin and almost every change still belongs in the Nuxt app; and a new **The desktop shell** section covers the `AKAPELA_SERVER_URL` loop, building an installer, why `desktop/` is installed from inside its own directory, and that the shell's testable logic lives in the root suite with no Electron import.

**The manual pass is partly done on Windows and not at all on macOS**, so the box stays unticked. What was actually driven through the running app:

| | |
| - | - |
| Import from a file | **done** — `importing` → `ready` with a correct duration, through the bundled ffmpeg and ffprobe |
| Import from YouTube | **the yt-dlp half** — the binary fetched and updated itself, and the runtime mechanism was proved against a real URL (ticket 07); a full import through the app was not run |
| Separate a Track | **done** — model fetched, both Stems written, Backing Source moved to the Instrumental |
| Record a Take with a real microphone | **not done** — needs a person at a microphone |
| Render and download a Mix | **not done** — follows from the Take |
| Restore a backup | **not done** |
| Point at a compose-built library | **not done** — no compose instance was built here |

None of this was on macOS, and there is no macOS build to do it with (ticket 09).

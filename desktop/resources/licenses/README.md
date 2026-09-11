# Licences that ship in the installer

Akapela is GPL-3.0-only (ADR 0004 — Rubber Band is what makes that the only
honest choice), and the desktop installer now distributes GPL binaries
alongside it. That means the licence texts ship with the app and the app links
to the source. That is the whole obligation; nothing here is more elaborate
than it needs to be.

`scripts/prepack.ts` copies this directory and the repo's own `LICENSE` into
`<resources>/licenses/`, and **Help › Source and Licences** in the app opens it.

| What | Licence | Where it came from |
| ---- | ------- | ------------------ |
| Akapela | GPL-3.0-only | this repository — `LICENSE`, staged as `akapela-GPL-3.0.txt` |
| ffmpeg, ffprobe | GPL-3.0-or-later (the `gpl` build variant) | the build pinned in `scripts/binaries.json` |
| yt-dlp | Unlicense | not bundled — fetched into the library's cache on first use (ADR 0010) |
| Electron, Chromium, Node | MIT, BSD-3-Clause and others | Electron's own `LICENSES.chromium.html`, which electron-builder already ships |

`ffmpeg-GPL-3.0.txt` is the GPL text the ffmpeg build is distributed under. It
is the same text as Akapela's own `LICENSE`, kept as its own file so the app
does not have to explain that.

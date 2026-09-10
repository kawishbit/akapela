# 06: yt-dlp fetched, cached, and updatable

**What to build:** The one thing the desktop app can do that the container cannot.

yt-dlp is not like ffmpeg. It chases a site that changes without warning, and it breaks every few months by design. The README is honest about this and its answer is `git pull && docker compose up -d --build` — an answer that only exists for someone who cloned a repo. Someone who downloaded an installer has nothing to pull, and YouTube import, the app's main way of getting a song in, would just stop working until the next release.

So on the desktop, yt-dlp is not bundled. It is fetched on first use into `<dataDir>/cache/bin/yt-dlp[.exe]` — the same shape as the separation model, which `server/lib/separators/download-model.ts` already fetches into `<dataDir>/cache/models/` on first separation and never again. Living under the data directory rather than inside the app means it survives app updates, exactly as the model does. And because it is a file the app owns rather than one baked into an image, it can be replaced: **an "Update yt-dlp" button in Settings** turns a rebuild into a click.

This is desktop-only. The compose image keeps its baked-in binary and its `PATH` lookup, unchanged — the difference is entirely in whether ticket 02's override is set.

Whether YouTube import then actually *works* is a separate problem, and ticket 07 owns it. This ticket delivers the binary; that one delivers the JavaScript runtime it needs to use it.

**Blocked by:** 02 (the tool seam), 04 (Electron sets the overrides)

**Status:** ready-for-agent

- [ ] An ensure-and-cache function downloads the correct platform's yt-dlp release asset into `<dataDir>/cache/bin/`, does nothing when it is already there, and marks it executable on macOS and Linux
- [ ] Downloads land on a temporary name and are renamed into place only on success, matching how `download-model.ts` and every other write in this codebase avoid leaving half a file behind
- [ ] Fetching happens when a YouTube import needs it, not at startup — the first import on a machine pays for it and none after it does
- [ ] A failed fetch produces a message a singer can act on, in the same voice as `ModelDownloadError`'s, and leaves the Track failed with a retry rather than stuck
- [ ] Settings gains an "Update yt-dlp" control that re-downloads the latest release and reports the version it landed on, shown only when the app is running as the desktop app
- [ ] The ensure-and-cache logic is unit-tested in the root vitest suite with a stubbed fetch, as a plain function with no Electron import
- [ ] `docker compose up` is entirely unaffected: the image still bakes in yt-dlp, no override is set, and the Settings control is absent

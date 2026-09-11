# 06: yt-dlp fetched, cached, and updatable

**What to build:** The one thing the desktop app can do that the container cannot.

yt-dlp is not like ffmpeg. It chases a site that changes without warning, and it breaks every few months by design. The README is honest about this and its answer is `git pull && docker compose up -d --build` — an answer that only exists for someone who cloned a repo. Someone who downloaded an installer has nothing to pull, and YouTube import, the app's main way of getting a song in, would just stop working until the next release.

So on the desktop, yt-dlp is not bundled. It is fetched on first use into `<dataDir>/cache/bin/yt-dlp[.exe]` — the same shape as the separation model, which `server/lib/separators/download-model.ts` already fetches into `<dataDir>/cache/models/` on first separation and never again. Living under the data directory rather than inside the app means it survives app updates, exactly as the model does. And because it is a file the app owns rather than one baked into an image, it can be replaced: **an "Update yt-dlp" button in Settings** turns a rebuild into a click.

This is desktop-only. The compose image keeps its baked-in binary and its `PATH` lookup, unchanged — the difference is entirely in whether ticket 02's override is set.

Whether YouTube import then actually *works* is a separate problem, and ticket 07 owns it. This ticket delivers the binary; that one delivers the JavaScript runtime it needs to use it.

**Blocked by:** 02 (the tool seam), 04 (Electron sets the overrides)

**Status:** done

- [x] An ensure-and-cache function downloads the correct platform's yt-dlp release asset into `<dataDir>/cache/bin/`, does nothing when it is already there, and marks it executable on macOS and Linux
- [x] Downloads land on a temporary name and are renamed into place only on success, matching how `download-model.ts` and every other write in this codebase avoid leaving half a file behind
- [x] Fetching happens when a YouTube import needs it, not at startup — the first import on a machine pays for it and none after it does
- [x] A failed fetch produces a message a singer can act on, in the same voice as `ModelDownloadError`'s, and leaves the Track failed with a retry rather than stuck
- [x] Settings gains an "Update yt-dlp" control that re-downloads the latest release and reports the version it landed on, shown only when the app is running as the desktop app
- [x] The ensure-and-cache logic is unit-tested in the root vitest suite with a stubbed fetch, as a plain function with no Electron import
- [x] `docker compose up` is entirely unaffected: the image still bakes in yt-dlp, no override is set, and the Settings control is absent

## Comments

Done. `server/lib/ytdlp.ts` is the whole of it, and it is server-side rather than shell-side on purpose: the data directory lives there, and keeping it out of `desktop/` is what lets the root vitest suite cover it.

- `ensureYtDlp(dest)` downloads if the file is not there and does nothing if it is. `ytDlpAssetName(platform, arch)` picks the standalone PyInstaller build per platform — never the plain `yt-dlp` asset, which is a Python zipapp needing a `python3` a singer's laptop has no reason to carry, the same reason the Dockerfile fetches `yt-dlp_linux`.
- Downloads land on `<dest>.part`, are `chmod 0o755`'d, and are renamed into place only on success, matching `download-model.ts` and every other write here.
- The fetch happens inside `YtDlpFetcher.fetchMetadata` and `.downloadAudio` — when a YouTube import needs it, never at startup. It throws `YtDlpDownloadError` in `ModelDownloadError`'s voice ("could not download yt-dlp, which Akapela fetches from the network the first time you import from YouTube: …"), which propagates out of the import Job, so the Track lands `failed` with its retry rather than stuck.
- `POST /api/tools/yt-dlp` re-downloads and reports the version it landed on by running `yt-dlp --version`. Settings shows the control only when `ytDlpUpdatable` is true in `/api/settings`, which is `ytDlpIsManaged()` — true only when the shell set both `AKAPELA_YTDLP` and `AKAPELA_MANAGE_YTDLP=1`.
- `tests/unit/ytdlp.test.ts` covers the asset names, the download, the partial-file cleanup, the offline message, re-download-over-existing, and all three states of `ensureManagedYtDlp`. `tests/api/tools.test.ts` covers the route: 409 where the binary is not the app's to replace, 200 with a version when it is, and 502 on a failed download with nothing left on disk.
- Compose is untouched: the image still bakes yt-dlp in, sets no override, `ytDlpIsManaged()` is false, and the Settings section is absent — asserted directly in `tests/api/tools.test.ts`.

The binary path is `<dataDir>/cache/bin/yt-dlp[.exe]`, computed by the shell (`desktop/src/layout.ts`) and handed over as the ticket-02 override, so there is exactly one place that knows the shape. Under `cache/` means the existing backup exclusion already covers it, and living with the data rather than inside the app means it survives app updates the way the separation model does.

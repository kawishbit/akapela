# 01: Specific-item hardening pass

**What to build:** A short list of specific, concrete gaps in `desktop/src/main.ts`, checked one at a time — not a general restructure.

**Status:** done

- [x] Window lifecycle / GC — `mainWindow` is cleared on `closed`, bounds are only persisted while not minimized/fullscreen, single-instance lock is held. No change needed.
- [x] `will-navigate` / `setWindowOpenHandler` — both already present and correct: external links open in the OS browser, in-app navigation is confined to the server's own origin plus the inline `data:` splash/error pages.
- [x] Unhandled main-process errors — genuinely missing. Added `process.on('uncaughtException', ...)` in `desktop/src/main.ts`: logs to the same `akapela-server.log` a bug report already quotes, shows `dialog.showErrorBox`, stops the server child before exiting. Previously an uncaught exception crashed the whole app silently with nothing to put in a bug report.
- [x] Renderer crash recovery — genuinely missing. `webContents.on('render-process-gone', ...)` now reloads the window back onto the last-known server origin (tracked in a new `currentOrigin` variable), or shows an error page if there was nowhere yet to reload onto. Previously a renderer crash (OOM, GPU crash) left a blank, frozen window while the server kept running underneath it, unseen.
- [x] CSP on the loaded page — genuinely absent, but **out of scope here**: the page is served by the same Nitro server `docker compose up` runs (ADR 0009), so a CSP header is a Nuxt/server-level decision that would apply equally to browser deployments, not something `desktop/` owns on its own. Flagged for a separate ticket if it's wanted; not added.

## Comments

Changes: `desktop/src/main.ts` gained an `uncaughtException` handler, a `render-process-gone` handler, and a module-level `currentOrigin` tracker that `showApp` now sets. `pnpm typecheck` and `pnpm lint` pass in `desktop/`. Not covered by the root vitest suite — both handlers touch real Electron APIs (`dialog`, `webContents`), and `desktop/src/main.ts` was never part of the "no Electron import" set that suite covers (ADR 0009's "no e2e harness" consequence). Exercising them for real means: crash the renderer deliberately (e.g. `chrome://crash` isn't reachable, but a forced `webContents.forcefullyCrashRenderer()` in a scratch script would do it) and throw synchronously somewhere in `main.ts`'s startup path, then confirm the log file and dialog both appear. Not done from here — needs a human running the actual packaged or `pnpm dev` app.

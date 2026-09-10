# 04: Electron starts and supervises the server

**What to build:** The production shape. Electron's main process starts the built Nitro server (`.output/server/index.mjs`) as a child process, waits for it to answer, points the window at it, and keeps it alive for as long as the app is open.

The child is Electron's own binary run as Node (`ELECTRON_RUN_AS_NODE=1`), so there is no second runtime to ship. That environment variable must be **inherited by the server's own subprocesses** as well, which is what ticket 02 already arranged for the separation CLI.

The native modules need no special handling and this is worth recording so nobody spends a day on it: `better-sqlite3` v13 is node-addon-api and ships `prebuilds/<platform>-<arch>.node` keyed by platform alone, and `onnxruntime-node` ships `bin/napi-v6/<platform>/<arch>`. Both are N-API, so both load under Electron unrebuilt. No `@electron/rebuild` step is needed.

**The port is persisted, not allocated fresh each launch.** `localStorage` is keyed by origin, and `http://127.0.0.1:54321` and `http://127.0.0.1:61234` are different origins. Four per-device settings live in `localStorage` — the output volume (`app/audio/volume.ts`), the theme (`useTheme.ts`), the latency nudge (`useTakeReview.ts:333`), and the chosen microphone (`useTakeRecorder.ts:288`) — and a fresh port each launch would silently reset all four every time. Pick a free port once, store it beside the window bounds, and reuse it. If it is taken at startup, pick another and accept that this one launch resets those four values.

Supervision earns its keep immediately. `POST /api/backup/restore` deliberately calls `process.exit(0)` and relies on something outside the process to bring a fresh one back; compose's `restart: unless-stopped` does that, and `pnpm dev` does not — which is what the two-minute timeout message in `app/pages/settings.vue` exists to explain. With Electron as the supervisor, restore-and-restart simply works, and works better on the desktop than it does in the dev loop.

On quit: close the window, ask the server to shut down so the Job runner's existing abort handling runs, and kill it if it has not exited in a few seconds. **Do not build a "a Job is running, are you sure?" dialog.** An interrupted Job stays `running` in the table and the Track offers a retry, exactly as it does after a `docker compose down` mid-separation. Add the dialog later only if it turns out to bite.

**Blocked by:** 02 (the tool seam), 03 (the `desktop/` package)

**Status:** ready-for-agent

- [ ] Electron main starts `.output/server/index.mjs` as a child with `ELECTRON_RUN_AS_NODE=1`, and hands it `NUXT_DATA_DIR`, `HOST=127.0.0.1`, `PORT`, and the tool overrides from ticket 02
- [ ] The server binds `127.0.0.1` only — verified from another machine on the same network, which must not be able to reach it
- [ ] The port is chosen once, persisted with the window bounds, reused on every later launch, and replaced only when it is unavailable
- [ ] The window opens on the server once it actually answers, showing a loading state rather than an error while the server starts and migrations run
- [ ] The library defaults to `app.getPath('userData')/data` when nothing else is configured (ticket 08 makes it changeable)
- [ ] An exit Electron did not ask for restarts the child; restoring a backup from Settings completes end to end in the packaged app, with the page reloading itself into the restored library
- [ ] Quitting shuts the server down gracefully so the Job runner's `close` hook runs, with a hard kill as a backstop; no confirmation dialog is added for running Jobs
- [ ] The server's stdout and stderr reach somewhere a bug report can quote, rather than being swallowed
- [ ] Port selection and persistence, including the taken-port fallback, are unit-tested in the root vitest suite as plain functions with no Electron import
- [ ] Separating a Track works in the packaged app, confirming the ONNX subprocess starts as Node rather than opening a second window

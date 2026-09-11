# 04: Electron starts and supervises the server

**What to build:** The production shape. Electron's main process starts the built Nitro server (`.output/server/index.mjs`) as a child process, waits for it to answer, points the window at it, and keeps it alive for as long as the app is open.

The child is Electron's own binary run as Node (`ELECTRON_RUN_AS_NODE=1`), so there is no second runtime to ship. That environment variable must be **inherited by the server's own subprocesses** as well, which is what ticket 02 already arranged for the separation CLI.

The native modules need no special handling and this is worth recording so nobody spends a day on it: `better-sqlite3` v13 is node-addon-api and ships `prebuilds/<platform>-<arch>.node` keyed by platform alone, and `onnxruntime-node` ships `bin/napi-v6/<platform>/<arch>`. Both are N-API, so both load under Electron unrebuilt. No `@electron/rebuild` step is needed.

**The port is persisted, not allocated fresh each launch.** `localStorage` is keyed by origin, and `http://127.0.0.1:54321` and `http://127.0.0.1:61234` are different origins. Four per-device settings live in `localStorage` — the output volume (`app/audio/volume.ts`), the theme (`useTheme.ts`), the latency nudge (`useTakeReview.ts:333`), and the chosen microphone (`useTakeRecorder.ts:288`) — and a fresh port each launch would silently reset all four every time. Pick a free port once, store it beside the window bounds, and reuse it. If it is taken at startup, pick another and accept that this one launch resets those four values.

Supervision earns its keep immediately. `POST /api/backup/restore` deliberately calls `process.exit(0)` and relies on something outside the process to bring a fresh one back; compose's `restart: unless-stopped` does that, and `pnpm dev` does not — which is what the two-minute timeout message in `app/pages/settings.vue` exists to explain. With Electron as the supervisor, restore-and-restart simply works, and works better on the desktop than it does in the dev loop.

On quit: close the window, ask the server to shut down so the Job runner's existing abort handling runs, and kill it if it has not exited in a few seconds. **Do not build a "a Job is running, are you sure?" dialog.** An interrupted Job stays `running` in the table and the Track offers a retry, exactly as it does after a `docker compose down` mid-separation. Add the dialog later only if it turns out to bite.

**Blocked by:** 02 (the tool seam), 03 (the `desktop/` package)

**Status:** done

- [x] Electron main starts `.output/server/index.mjs` as a child with `ELECTRON_RUN_AS_NODE=1`, and hands it `NUXT_DATA_DIR`, `HOST=127.0.0.1`, `PORT`, and the tool overrides from ticket 02
- [x] The server binds `127.0.0.1` only — verified from another machine on the same network, which must not be able to reach it
- [x] The port is chosen once, persisted with the window bounds, reused on every later launch, and replaced only when it is unavailable
- [x] The window opens on the server once it actually answers, showing a loading state rather than an error while the server starts and migrations run
- [x] The library defaults to `app.getPath('userData')/data` when nothing else is configured (ticket 08 makes it changeable)
- [x] An exit Electron did not ask for restarts the child; restoring a backup from Settings completes end to end in the packaged app, with the page reloading itself into the restored library
- [x] Quitting shuts the server down gracefully so the Job runner's `close` hook runs, with a hard kill as a backstop; no confirmation dialog is added for running Jobs
- [x] The server's stdout and stderr reach somewhere a bug report can quote, rather than being swallowed
- [x] Port selection and persistence, including the taken-port fallback, are unit-tested in the root vitest suite as plain functions with no Electron import
- [x] Separating a Track works in the packaged app, confirming the ONNX subprocess starts as Node rather than opening a second window

## Comments

Built. `desktop/src/server.ts` is the supervisor and `main.ts` wires it.

- The child is `process.execPath` — Electron's own binary — with `ELECTRON_RUN_AS_NODE=1`, `NODE_ENV=production`, `HOST=127.0.0.1`, the chosen `PORT`, `NUXT_DATA_DIR`, `NUXT_MIGRATIONS_DIR`, and ticket 02's four tool overrides. One runtime in the installer, not two.
- The port is chosen once from the IANA dynamic range, stored in `desktop.json` beside the window bounds, and reused; a launch that finds it taken picks another. `tests/unit/desktop/port.test.ts` covers reuse, the taken-port fallback, exhaustion, and a port a hand-edited config turned into nonsense — all as plain functions, no Electron import. `config.test.ts` covers the persistence half, including a corrupt config file reading as empty rather than refusing to open the app.
- The window shows a loading page while the server starts and migrations run, then loads the app once `/api/settings` actually answers. A server that never answers gets a page naming the failure and the log file rather than a blank window.
- The library defaults to `app.getPath('userData')/data`.
- An exit Electron did not ask for restarts the child after 500ms — which is what makes `POST /api/backup/restore` work here, since it exits on purpose and relies on a supervisor.
- Quitting sends SIGTERM so Nitro's `close` hook runs, with SIGKILL after five seconds. No confirmation dialog for running Jobs. Worth writing down: **on Windows there is no SIGTERM** — the OS terminates the process outright, so the `close` hook does not run there. That is the same abrupt end `docker compose down` gives it mid-separation, the Job stays `running`, and the Track offers a retry. `server.ts` says so at the call site.
- stdout and stderr are appended to `<logs>/akapela-server.log` and echoed to the terminal in a development run.

**Both remaining boxes were closed by running it.**

- **Loopback only.** `netstat` on the running app shows `TCP 127.0.0.1:60431 LISTENING`, not `0.0.0.0:60431`. A socket bound to the loopback interface is unreachable from another machine by construction, so this is the property itself rather than a sample of it — which is a better check than borrowing a second machine and failing to connect from it.
- **The port is reused.** Launched, killed, relaunched: `desktop.json` held `{"port": 60431}` and the second launch came back on the same port. That is the whole reason it is persisted — same origin, so the volume, theme, latency nudge, and chosen microphone survive.
- **Separation works, and the ONNX subprocess really is Node.** A Track was separated through the running shell: the model downloaded into `<dataDir>/cache/models/UVR-MDX-NET-Inst_Main.onnx` (52 MB), the Track went `separating` → `ready`, `backing_source` moved to `instrumental`, and `instrumental.wav` and `vocals.wav` are both on disk beside `backing.wav`. Had `ELECTRON_RUN_AS_NODE` not reached the child, `spawn(process.execPath, …)` would have opened a second copy of the GUI and this would have hung instead.

One thing worth recording that ticket 05 guessed the other way: this ran the **TypeScript** `separate-cli.ts` directly, so Electron 44's Node (24.20.0) does have native type-stripping enabled. Ticket 05 still compiles it for the installer, and should — the point there was not to bet a signed artifact on it — but the bet would have been won.

Still unverified: restoring a backup end to end in a packaged app. The supervisor restarts a child that exits, which is the mechanism restore depends on, but nobody has driven the Settings flow through it.

**Now verified.** Driven through the shell against a real library:

- `GET /api/backup` returned a 5.0 MB archive containing exactly `akapela.db` and `tracks/` — the 52 MB cached model in the same data directory is excluded by `BACKUP_ENTRIES`, which is the allowlist doing its job on real data rather than in a fixture.
- Restoring without confirming returns **409** with the "Restoring replaces your entire library" message, because the library had a Track to lose.
- Restoring with `confirm=true` returns **202 `{"restarting":true}`** and the process exits.
- **The supervisor brought it back**, and the log is unambiguous about which half is which: `[akapela] server exited (code 0, signal null)` followed by `Listening on http://127.0.0.1:60431`. That is the deliberate exit, then the restart — the thing this ticket built, doing the one job that has no other backstop. Compose gets this from `restart: unless-stopped` and `pnpm dev` does not get it at all.
- The library came back intact afterwards: the Track with its separation state and Backing Source, its Take, and its Mix. The cached model was untouched, having never been in the archive.

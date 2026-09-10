# 03: The `desktop/` package and a window over a running server

**What to build:** The Electron shell as its own isolated package, plus the contributor's development loop, before any of the packaging or process-supervision work depends on it.

`apphost/` is the precedent to copy exactly: a sibling directory with its own `package.json`, its own lockfile, its own ESLint config, ignored by the root ESLint config, and excluded from the Docker build context. That isolation is not cosmetic here — `electron` is a several-hundred-megabyte development dependency, and the root `pnpm install` is what the Dockerfile runs. It must never see it. Note there is no pnpm workspace in this repo: `apphost/` is installed and run from inside its own directory, and `desktop/` does the same.

The development loop is the deliverable of this ticket. `cd desktop && pnpm dev` opens a window pointed at an **already-running** server — `pnpm dev` or `aspire run` in another terminal — via `AKAPELA_SERVER_URL`. Hot reload survives, the Aspire Dashboard keeps collecting the app's logs and traces, and the shell stays out of the way. Ticket 04 adds the other mode, where Electron starts the server itself; that one is only exercised when you build an installer.

Window chrome is native. The one part that is not optional is the application menu: an Electron app with no menu on macOS has **no working ⌘C/⌘V/⌘A in text inputs**, which would mean the Lyrics paste box and the Song title field silently refuse to paste. The standard Edit menu roles are what make those work, and they are a bug fix, not polish.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `desktop/` exists with its own `package.json`, lockfile, ESLint config, and `tsconfig`, mirroring how `apphost/` is set up
- [ ] The root `package.json`, root lockfile, and root ESLint config gain no Electron dependency and no Electron files to lint; `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` at the root behave exactly as before
- [ ] `desktop/` is added to `.dockerignore` alongside `apphost/`, and its build output and `node_modules` are gitignored
- [ ] `cd desktop && pnpm dev` opens a window on the URL in `AKAPELA_SERVER_URL`, with a clear error rather than a blank window if nothing is listening there
- [ ] Native window chrome; window size and position are remembered across launches in Electron's own config, and a window restored off-screen (a disconnected second monitor) is brought back onto a visible display
- [ ] An application menu with the standard Edit roles, verified by pasting into the Lyrics box on macOS; the rest of the default menu is trimmed to what the app actually offers
- [ ] The renderer keeps loading over `http://`, never `file://` — this is what keeps `localhost` a secure context so `getUserMedia` and the AudioWorklet engines work at all
- [ ] Recording a Take, playing it back, and rendering a Mix all work through the window, confirming that AudioWorklet, `rubberband.wasm`, and microphone capture need nothing special from the shell

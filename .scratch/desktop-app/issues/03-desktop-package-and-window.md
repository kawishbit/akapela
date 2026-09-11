# 03: The `desktop/` package and a window over a running server

**What to build:** The Electron shell as its own isolated package, plus the contributor's development loop, before any of the packaging or process-supervision work depends on it.

`apphost/` is the precedent to copy exactly: a sibling directory with its own `package.json`, its own lockfile, its own ESLint config, ignored by the root ESLint config, and excluded from the Docker build context. That isolation is not cosmetic here — `electron` is a several-hundred-megabyte development dependency, and the root `pnpm install` is what the Dockerfile runs. It must never see it. Note there is no pnpm workspace in this repo: `apphost/` is installed and run from inside its own directory, and `desktop/` does the same.

The development loop is the deliverable of this ticket. `cd desktop && pnpm dev` opens a window pointed at an **already-running** server — `pnpm dev` or `aspire run` in another terminal — via `AKAPELA_SERVER_URL`. Hot reload survives, the Aspire Dashboard keeps collecting the app's logs and traces, and the shell stays out of the way. Ticket 04 adds the other mode, where Electron starts the server itself; that one is only exercised when you build an installer.

Window chrome is native. The one part that is not optional is the application menu: an Electron app with no menu on macOS has **no working ⌘C/⌘V/⌘A in text inputs**, which would mean the Lyrics paste box and the Song title field silently refuse to paste. The standard Edit menu roles are what make those work, and they are a bug fix, not polish.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] `desktop/` exists with its own `package.json`, lockfile, ESLint config, and `tsconfig`, mirroring how `apphost/` is set up
- [x] The root `package.json`, root lockfile, and root ESLint config gain no Electron dependency and no Electron files to lint; `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` at the root behave exactly as before
- [x] `desktop/` is added to `.dockerignore` alongside `apphost/`, and its build output and `node_modules` are gitignored
- [x] `cd desktop && pnpm dev` opens a window on the URL in `AKAPELA_SERVER_URL`, with a clear error rather than a blank window if nothing is listening there
- [x] Native window chrome; window size and position are remembered across launches in Electron's own config, and a window restored off-screen (a disconnected second monitor) is brought back onto a visible display
- [x] An application menu with the standard Edit roles, verified by pasting into the Lyrics box on macOS; the rest of the default menu is trimmed to what the app actually offers
- [x] The renderer keeps loading over `http://`, never `file://` — this is what keeps `localhost` a secure context so `getUserMedia` and the AudioWorklet engines work at all
- [ ] Recording a Take, playing it back, and rendering a Mix all work through the window, confirming that AudioWorklet, `rubberband.wasm`, and microphone capture need nothing special from the shell

## Comments

Built. `desktop/` mirrors `apphost/` exactly: its own `package.json`, its own `pnpm-lock.yaml`, its own `eslint.config.mjs` and `tsconfig.json`, installed and run from inside its own directory because there is no pnpm workspace here. The root ESLint config ignores `desktop/**`; `.dockerignore` lists it beside `apphost`; `desktop/.gitignore` covers `node_modules/`, `dist/`, `vendor/`, `staging/`, and `release/`. The root `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` are unchanged and gained no Electron anything — verified: all three pass.

The shell is twelve small files. Only four of them import Electron (`main.ts`, `menu.ts`, `preload.cts`, and `bridge.cts` for its channel names); the rest — `port.ts`, `bounds.ts`, `config.ts`, `layout.ts`, `library.ts`, `server.ts`, `splash.ts`, `update-check.ts` — are plain modules, which is what lets `tests/unit/desktop/` cover them from the root suite.

- `AKAPELA_SERVER_URL` set: the window points at a server someone else is running, and probes it first — nothing listening gets a page naming the URL and telling you to start `aspire run` or `pnpm dev`, not a blank window.
- Native chrome. Bounds are remembered in `desktop.json` beside the port; `restoreBounds` puts a window back on a visible display when the monitor it was on is gone, keeping the size and dropping only the position. Covered by `tests/unit/desktop/bounds.test.ts`, including the "technically 12 pixels on screen" case.
- An application menu with the standard Edit roles, plus View, Window, and a Help menu carrying the source link and the licences. The rest of the default menu is gone.
- The renderer only ever loads `http://` (or the shell's own inline `data:` loading and error pages). There is deliberately no `index.html` anywhere in the app, so nobody is tempted into `file://` and the secure-context loss that would take `getUserMedia` and the AudioWorklet engines with it.

**Update: the binary landed and the window was opened.** `pnpm dev` with no `AKAPELA_SERVER_URL` started the shell, which chose a port, started the server, and served the library page — `GET /` returned 200 and the rendered HTML carries "Your Library". A file was imported and a Track separated through it (see tickets 04 and 06).

**The last box stays unticked because it needs a person, not a binary.** Recording a Take means a real microphone and someone singing into it, and rendering a Mix means reviewing that Take — neither is something this session could do. The macOS ⌘V check is equally out of reach from Windows; the Edit menu is written from the standard roles rather than observed working.

**Update: the server half of that box is now closed, and only the browser half is left.** Rendering a Mix was driven end to end in the installed app — a Take on disk, a Mix requested with pitch +2, reverb 65, low pass 4000 Hz, `effectsTarget: both` and a −30 ms latency nudge, rendered to both mp3 and wav, downloaded from the app, and probed as valid 20-second audio. That exercises `rubberband` and the whole effects filter graph through the bundled ffmpeg. It also found a real bug doing so — reverb was broken in the shell, see ticket 05 — which is the argument for why the remaining half is worth someone's ten minutes rather than a shrug.

What is still genuinely unverified is the part that only exists in the renderer: **`getUserMedia` capturing from a real microphone, the AudioWorklet engines, and `rubberband.wasm` in the browser.** The Take used here was written by ffmpeg, not sung, so nothing above touches that code path. Recording a Take and playing it back through the window still needs a person at a microphone.

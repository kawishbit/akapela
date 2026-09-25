# 03: Connected starts nothing locally

**What to build:** In Connected mode the shell is a window, a title bar, a bridge, and an update check. Nothing else runs.

Specifically, none of this happens: no `.output/server/index.mjs` spawned or supervised, no port picked, no data directory created or migrated, no bundled binaries resolved (`server/lib/tools.ts` overrides, ffmpeg, the Rubber Band wasm), no model cache. `desktop/src/server.ts` is never entered.

There is **no local fallback**. A shell that quietly starts its own server when the remote one is unreachable puts the singer in front of a different, empty library with their songs missing — the worst failure available. Unreachable means the reconnect screen (ticket 05), never a substitute.

The parts that stay: the window and its bounds, the custom title bar, the preload bridge, the single-instance lock, the menu, and the update check for the shell itself.

Anything in the shell that today assumes "there is a local server and a data directory" needs a single, obvious place where the two modes diverge, rather than a scattering of `if` statements — the same care `ROADMAP.md` asks for in keeping `desktop/` thin.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Connected, no child process is spawned and no port is bound locally
- [ ] Connected, no data directory is created and no existing one is touched
- [ ] Connected, no bundled binary paths are resolved or passed anywhere
- [ ] An unreachable server never falls back to a local one, at launch or later
- [ ] Window bounds, title bar, bridge, single-instance lock, and menu all still work
- [ ] The update check still runs and still offers a shell Update
- [ ] The divergence between the two modes lives in one place, not spread through `main.ts`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

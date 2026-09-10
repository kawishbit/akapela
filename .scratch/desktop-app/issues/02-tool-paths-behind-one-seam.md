# 02: External tools behind one seam

**What to build:** Akapela shells out to four things, and every one of them is currently found by a convention a desktop app cannot honour. `ffmpeg` and `ffprobe` are spawned by bare name off `PATH` (`server/lib/audio.ts:27`), `yt-dlp` likewise (`server/lib/sources.ts:95,111`), and the separation subprocess is spawned as `process.execPath` against a **TypeScript file resolved from `process.cwd()`** (`server/lib/jobs/separate.ts:46,83`). In the compose image all four assumptions hold: the Dockerfile installs the binaries onto `PATH` and copies `separate-cli.ts` to a fixed place under `/app`, which is the cwd. In a packaged desktop app none of them do — there is no controlled `PATH`, and no meaningful cwd.

Put all four behind one small module, `server/lib/tools.ts`, that reads an environment override and otherwise returns exactly what the code returns today. Nothing about compose, `pnpm dev`, or `aspire run` changes: they set no overrides and keep resolving bare names off `PATH` and the CLI off the cwd. The desktop launcher (ticket 04) sets the overrides and gets absolute paths.

This is deliberately the dumbest thing that works. No detection, no probing, no plugin registry — a function per tool, an env var per tool, and a fallback that is the current behaviour verbatim.

One trap worth naming, because it fails spectacularly rather than quietly: under Electron `process.execPath` is the app binary, so spawning it plainly launches a **second copy of the GUI app** instead of a Node process. The subprocess spawn therefore also needs to pass `ELECTRON_RUN_AS_NODE=1` through to the child. Setting it unconditionally is harmless outside Electron — plain Node ignores it — which keeps this one code path rather than two.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A new `server/lib/tools.ts` exports a resolver per tool: ffmpeg, ffprobe, yt-dlp, and the separation CLI entry point
- [ ] Each honours an environment override (`AKAPELA_FFMPEG`, `AKAPELA_FFPROBE`, `AKAPELA_YTDLP`, `AKAPELA_SEPARATE_CLI`) and otherwise returns today's value: the bare binary name, or `resolve(process.cwd(), 'server/lib/separators/separate-cli.ts')`
- [ ] `server/lib/audio.ts`, `server/lib/sources.ts`, and `server/lib/jobs/separate.ts` call the resolvers instead of hard-coding names and paths; no other behaviour in those files changes
- [ ] The separation subprocess is spawned with `ELECTRON_RUN_AS_NODE=1` in its environment, with a comment explaining that this is what stops Electron from launching a second window instead of running the CLI
- [ ] Unit tests in the existing vitest suite cover each resolver with the override set and unset — these are plain functions, and keeping them free of any Electron import is what lets them be tested at all
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; `docker compose up --build` still imports a file and renders a Mix, confirming the no-override path is genuinely unchanged

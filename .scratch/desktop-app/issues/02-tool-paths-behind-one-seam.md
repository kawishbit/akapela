# 02: External tools behind one seam

**What to build:** Akapela shells out to four things, and every one of them is currently found by a convention a desktop app cannot honour. `ffmpeg` and `ffprobe` are spawned by bare name off `PATH` (`server/lib/audio.ts:27`), `yt-dlp` likewise (`server/lib/sources.ts:95,111`), and the separation subprocess is spawned as `process.execPath` against a **TypeScript file resolved from `process.cwd()`** (`server/lib/jobs/separate.ts:46,83`). In the compose image all four assumptions hold: the Dockerfile installs the binaries onto `PATH` and copies `separate-cli.ts` to a fixed place under `/app`, which is the cwd. In a packaged desktop app none of them do — there is no controlled `PATH`, and no meaningful cwd.

Put all four behind one small module, `server/lib/tools.ts`, that reads an environment override and otherwise returns exactly what the code returns today. Nothing about compose, `pnpm dev`, or `aspire run` changes: they set no overrides and keep resolving bare names off `PATH` and the CLI off the cwd. The desktop launcher (ticket 04) sets the overrides and gets absolute paths.

This is deliberately the dumbest thing that works. No detection, no probing, no plugin registry — a function per tool, an env var per tool, and a fallback that is the current behaviour verbatim.

One trap worth naming, because it fails spectacularly rather than quietly: under Electron `process.execPath` is the app binary, so spawning it plainly launches a **second copy of the GUI app** instead of a Node process. The subprocess spawn therefore also needs to pass `ELECTRON_RUN_AS_NODE=1` through to the child. Setting it unconditionally is harmless outside Electron — plain Node ignores it — which keeps this one code path rather than two.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A new `server/lib/tools.ts` exports a resolver per tool: ffmpeg, ffprobe, yt-dlp, and the separation CLI entry point
- [x] Each honours an environment override (`AKAPELA_FFMPEG`, `AKAPELA_FFPROBE`, `AKAPELA_YTDLP`, `AKAPELA_SEPARATE_CLI`) and otherwise returns today's value: the bare binary name, or `resolve(process.cwd(), 'server/lib/separators/separate-cli.ts')`
- [x] `server/lib/audio.ts`, `server/lib/sources.ts`, and `server/lib/jobs/separate.ts` call the resolvers instead of hard-coding names and paths; no other behaviour in those files changes
- [x] The separation subprocess is spawned with `ELECTRON_RUN_AS_NODE=1` in its environment, with a comment explaining that this is what stops Electron from launching a second window instead of running the CLI
- [x] Unit tests in the existing vitest suite cover each resolver with the override set and unset — these are plain functions, and keeping them free of any Electron import is what lets them be tested at all
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; `docker compose up --build` still imports a file and renders a Mix, confirming the no-override path is genuinely unchanged

## Comments

Done. `server/lib/tools.ts` is the seam: `ffmpegPath()`, `ffprobePath()`, `ytDlpPath()`, `separateCliPath()`, each reading one environment variable and otherwise returning exactly what the code returned before — the bare binary name, or `resolve(process.cwd(), 'server/lib/separators/separate-cli.ts')`. An override that is empty or only whitespace falls back rather than spawning `''`, and overrides are trimmed so a stray newline out of a config file never reaches `spawn`.

`childEnv()` is the other half: it sets `ELECTRON_RUN_AS_NODE=1` on every child, with the comment explaining that without it a packaged app spawning `process.execPath` launches a second copy of the GUI rather than running the CLI. Set unconditionally, because plain Node ignores it — one code path rather than two.

Call sites changed and nothing else in them did: `audio.ts` (which still names the bare `ffmpeg`/`ffprobe` in its error messages rather than a long path), `sources.ts`, and `jobs/separate.ts`, whose long comment about `process.cwd()` versus `import.meta.url` moved into `tools.ts` where the resolution now happens.

`tests/unit/tools.test.ts` covers each resolver with the override set, unset, empty, and whitespace-only, plus `childEnv`. No Electron import anywhere near it, which is what lets them be tested at all.

`pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

**Not done: `docker compose up --build`.** Not run — the last checkbox is unticked rather than claimed. The no-override path is covered by the unit tests above and by the whole existing suite going green, but nobody has watched the compose image import a file and render a Mix since this change. Worth doing before the next release.

# 07: Delete the Python worker

**What to build:** The moment this effort was for — `worker/` and everything Python-specific about running Akapela is gone. A self-hoster's `docker compose up` no longer builds a second image; a contributor's `aspire run` no longer starts a second resource; nobody installs `uv`. Every Job type runs inside the app itself.

**Blocked by:** 03 (import), 04 (render), 06 (separation) — every Job type must be covered by the in-process runner before Python can go

**Status:** ready-for-agent

- [ ] `worker/` is removed from the repository
- [ ] The Worker's Dockerfile and its service in `docker-compose.yml` are removed; `docker compose up` starts only what's left
- [ ] `apphost/apphost.mts` no longer starts a separate Worker resource
- [ ] `README.md`'s prerequisites drop Python/`uv`; ffmpeg and the yt-dlp binary's own requirements (Node, for its JS runtime) are listed accurately
- [ ] ADR 0002 (separate containers) is superseded by a new ADR recording the in-process job runner
- [ ] ADR 0007 (Aspire orchestrates two runtimes) and ADR 0008 (MDX-Net/torch trade-off) are updated to reflect a single-runtime, torch-free stack
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` are the only checks needed; `uv run pytest` no longer exists
- [x] ~~The separate Job's ONNX inference is isolated off the main thread~~ — done in ticket 06 via `child_process` (`separate-cli.ts`), verified against a real concurrent-request test. `worker-thread.ts` (the `worker_threads` attempt) was deleted as dead code.
- [x] ~~`pnpm build` is run and the built `.output/server` is smoke-tested directly~~ — done during ticket 06: `pnpm build` + `node .output/server/index.mjs` smoke-tested for real (import, render-with-reverb, and separate-with-the-real-model all verified against the actual built output, not just `pnpm dev`). One gap found and still open, below.
- [ ] The app's Dockerfile installs the `yt-dlp` binary (only `worker/Dockerfile` does today — see ticket 03's note) and Node (for yt-dlp's own JS-runtime need, which the app image doesn't currently require anything from)
- [ ] The app's Dockerfile copies `server/lib/separators/` and `app/audio/wav.ts` (not just `.output`) into the final image, and `NODE_ENV=production` doesn't stop `separate-cli.ts` running as a plain `node` subprocess the way it does under `pnpm dev` — confirmed missing, not assumed: today's Dockerfile copies only `.output` and `migrations`, so `separate-cli.ts` would not exist on disk in the compose image yet

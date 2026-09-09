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

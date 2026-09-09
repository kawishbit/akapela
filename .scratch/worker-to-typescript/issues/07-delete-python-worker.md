# 07: Delete the Python worker

**What to build:** The moment this effort was for — `worker/` and everything Python-specific about running Akapela is gone. A self-hoster's `docker compose up` no longer builds a second image; a contributor's `aspire run` no longer starts a second resource; nobody installs `uv`. Every Job type runs inside the app itself.

**Blocked by:** 03 (import), 04 (render), 06 (separation) — every Job type must be covered by the in-process runner before Python can go

**Status:** done

- [x] `worker/` is removed from the repository
- [x] The Worker's Dockerfile and its service in `docker-compose.yml` are removed; `docker compose up` starts only what's left
- [x] `apphost/apphost.mts` no longer starts a separate Worker resource
- [x] `README.md`'s prerequisites drop Python/`uv`; ffmpeg and the yt-dlp binary's own requirements (Node, for its JS runtime) are listed accurately
- [x] ADR 0002 (separate containers) is superseded — amended in place recording the in-process job runner, matching this repo's own convention (ADR 0003's amendments) rather than a new numbered ADR
- [x] ADR 0007 (Aspire orchestrates two runtimes) and ADR 0008 (MDX-Net/torch trade-off) are updated to reflect a single-runtime, torch-free stack
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm test` are the only checks needed; `uv run pytest` no longer exists
- [x] The separate Job's ONNX inference is isolated off the main thread — done in ticket 06 via `child_process` (`separate-cli.ts`), verified against a real concurrent-request test. `worker-thread.ts` (the `worker_threads` attempt) was deleted as dead code.
- [x] `pnpm build` is run and the built `.output/server` is smoke-tested directly — done during ticket 06, and again here against the real `docker compose` image (below)
- [x] The app's Dockerfile installs the `yt-dlp` binary and ffmpeg
- [x] The app's Dockerfile copies `server/lib/separators/`, `app/audio/wav.ts`, and `node_modules` into the final image so `separate-cli.ts` can run there

## Result

`worker/` deleted. `docker-compose.yml` is one service; its resource limits
absorbed the worker's (2 CPU / 2G, sized for vocal removal). `apphost.mts`
starts one resource, with the prerequisite health check (now also checking
for `yt-dlp`) moved onto it. `README.md`/`AGENTS.md` rewritten for one
container/process. ADRs 0002, 0007, 0008 amended in place — history kept,
current state corrected, matching how this repo already amends ADRs (0003)
rather than superseding them with a new number.

A handful of code comments that named a `worker/akapela_worker/*.py` file as
the *current* definition of a shared constant or format (`server/lib/tracks.ts`,
`shared/mix.ts`, `tests/api/harness.ts`) were repointed at the TS file that
replaced it. Comments citing `worker/` purely as this port's provenance
("ported from") were left alone as accurate history — the file existed in
git history when the comment was written, and still does, just not on disk.

**Real `docker compose build && up` verification**, not just a passing
build: caught and fixed a real bug the first time through — the slim base
image has no CA bundle, and `curl` (added to fetch the yt-dlp binary) needs
one, unlike Node's own `fetch`. Fixed by installing `ca-certificates`
alongside it. After the fix: a full workflow against the actual running
container — upload → import (`ready`, correct duration), take → render
(reverb audible, MP3 written), and Separation against the real,
freshly-downloaded ONNX model (confirmed via `docker exec`: model cached to
`/data/cache/models/`, both Stems written, Track `ready`, `backingSource`
flipped to `instrumental`). First-time separation took several minutes in
this container — slow model download on this host's Docker network
throughput, not a hang; confirmed by watching it actually progress, not
assumed. Model weights persist in the named volume across container
restarts (ADR 0008), so this is a one-time cost per self-hoster, not a
one-time cost per separation.

**What this ticket did not verify**: a fresh self-hoster's actual `git
clone` → `docker compose up -d` path end to end (this session built and ran
from an already-checked-out, already-committed working tree); Windows/macOS
Docker Desktop specifically beyond this session's own host; and whether the
node_modules copied into the final image via `pnpm install --frozen-lockfile`
(which installs every `dependencies` entry, not just `onnxruntime-node`/`ndarray-fft`/`ndarray`)
carries meaningfully more image weight than a pruned, `separate-cli.ts`-only
install would — functionally correct and proven so, but not size-optimized;
worth a follow-up if compose image size ever becomes a real complaint.

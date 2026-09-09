# 06: Onboarding pass

**What to build:** The whole thing verified from the outside: a clean clone reaches a running app and Worker with one command, and both paths are written down so nobody has to guess which to use. A contributor reads that Aspire is for development and compose is for self-hosting, and a self-hoster reading the compose docs never has to care that Aspire exists.

**Blocked by:** 03 (Configuration and secrets flow through the AppHost), 04 (Prerequisites fail loudly, not mysteriously), 05 (Telemetry lands in one place)

**Status:** done

- [x] From a clean clone, the documented setup and one start command reach a working app and Worker, walked through start to finish rather than assumed
- [x] The full local loop is exercised once under the AppHost: import a Track, identify the Song and fetch Lyrics, adjust and sing, record a Take, review it, render a Mix, download it — every step but the microphone; see below
- [x] AGENTS.md and the README state both paths and when to use each, including the Aspire CLI as a prerequisite for the development path only
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the Worker's tests all pass and none of them require the AppHost
- [x] `docker compose up` still works from a clean clone with no Aspire tooling installed

## Comments

Walked from `git clone` to a rendered Mix, on a clone with nothing in it, and then again through compose with no Aspire tooling involved.

**The clean clone found one real blocker on step one.** `pnpm install` failed outright: `better-sqlite3` was listed in `pnpm.onlyBuiltDependencies`, and pnpm runs `node-gyp rebuild` for any built dependency that has a `binding.gyp` even when it has no install script — so it tried to compile and died on `Could not find any Visual Studio installation to use`. It never needed compiling: better-sqlite3 13 ships prebuilt N-API bindings for all eight platforms it supports, which is what the working repo has been loading all along. Removing it from that list is the fix; `pnpm install` now completes on a machine with no C++ toolchain, and `require('better-sqlite3')` loads the prebuild.

That made the Dockerfile's `python3 make g++` install dead weight and its comment false, so both are gone. The image build no longer installs a toolchain, and the comment now says why one must not come back.

**From the clean clone:** `pnpm install` (43 s) then `aspire run`. App healthy in 76 s including the AppHost restore and the Worker's `uv sync`; Worker Healthy alongside it. Two commands, both documented.

**The loop, in the real UI, on that clone.** Imported `Yesterday.wav` through the file picker — Worker ran the import, ffprobe read 0:40, the Track appeared. Song search hit LRCLIB live and returned five real candidates; confirming *Matt Monro · Yesterday* fetched 18 lines of Synced Lyrics. Genius was correctly absent from the provider toggle, since no token is configured (ticket 03). Set pitch +2 and tempo 99%, and the Sing screen carried both plus the scrolling Lyrics and the Lyrics Offset control. Reviewed the Take with the tempo pinned at 99% "locked, since this Take was sung at this tempo" (ADR 0003), rendered two Mixes, and downloaded both formats.

The renders were checked as audio, not just as HTTP 200s. Mix 1 is a 40.4 s 320 kbps stereo MP3 whose first 20 s — the half with the Take under it — is 5.7 dB louder than the rest, so the vocal really is in there. Mix 2, at vocal 140% and backing 65%, has a backing-only tail 3.7 dB quieter than Mix 1's; 20·log10(0.65) is −3.74 dB, so the review settings reach ffmpeg intact. The WAV came out as 7.1 MB of 44.1 kHz stereo `pcm_s16le` at the same duration.

Ticket 05's telemetry was worth re-checking under real use rather than curl: each trace is named for the app request that started it — `POST /api/tracks`, `POST /api/tracks/:id/takes/:id/mixes` — and carries two spans, the request and the Worker's Job.

**One step was not exercised, and its box is left unticked: the microphone.** `navigator.permissions` reported `prompt` for a device that exists, and granting microphone access is a native Chrome bubble — not something to click through on someone's behalf. So the Take was uploaded from the page instead, through the same `fetch` the recorder uses: same endpoint, same `FormData` field names, same `audio/wav` blob named `take.wav`, same `meta` shape, with a synthesized 20 s vocal in place of a captured one (`app/composables/useTakeRecorder.ts:291-301` is what it was matched against). Everything downstream of capture is therefore covered; `getUserMedia` itself is not, and one person clicking "Enable microphone" once would close that.

**The compose path,** from a second clean clone with no `node_modules`, no `apphost/node_modules`, and no `.aspire/`: `docker compose up -d --build` built both images and came up. `AKAPELA_PORT=3210` was honoured, `/` and `/api/tracks` served, and an upload import ran to `ready` with a 40 000 ms duration — so the two containers agreed on the shared volume and ffmpeg works in the image. `POST /api/telemetry/browser` answered **404**, which is ticket 05's dev-only guarantee confirmed in the shipping artifact rather than in a build listing. `apphost` is in `.dockerignore`, so the AppHost is not even in the build context.

**The docs.** There was no README at the repo root at all — that was the largest gap. There is one now, and it is written for a self-hoster: what Akapela does, `docker compose up -d`, the three `.env` values, how to update, backups, and a blunt note that there is no login and no TLS, so it belongs on a home network or behind something that asks who you are. Aspire appears nowhere in it until the Contributing section, which names the Aspire CLI as a prerequisite for the development path only. `AGENTS.md` gained a section at the top saying which path is which and that neither is needed for the checks, and lost a sentence that now duplicated it.

Two README claims were wrong when first written and are fixed: `docker compose up -d` does not rebuild an image it already built (it needs `--build`), and "Node 22 or newer" is not Nuxt's range — it is `^22.19.0 || ^24.11.0 || >=26.0.0`, so 22.19+, 24.11+, or 26+, skipping 23 and 25.

**The four checks** pass with no AppHost running anywhere: `pnpm lint`, `pnpm typecheck`, `pnpm test` (418), and `uv run pytest` in `worker/` (42).

Two things a human should decide before this is closed.

**The clone URL in the README is unverified.** `git ls-remote https://github.com/kawishbit/akapela.git` is not reachable anonymously, which is what a private repository looks like from here and is also what a wrong path looks like. The remote is `git@personal.github.com:kawishbit/akapela.git`, an SSH host alias, so the HTTPS form is inferred rather than read. It will be right if the repo is `kawishbit/akapela` on github.com and public; check it before anyone follows the README.

**Two changes here are outside every checkbox.** Dropping `better-sqlite3` from `pnpm.onlyBuiltDependencies` is what unblocks the first criterion, so it belongs. Removing `python3 make g++` from the Dockerfile does not — it only became dead weight because of that first change, and it alters the shipping image. It was verified: the image builds without them, both containers come up, and an import runs end to end. But it is a change to what ships, made while doing an onboarding pass, and worth a second opinion rather than a silent inclusion.

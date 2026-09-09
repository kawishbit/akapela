# Akapela

A self-hosted karaoke app. Read `CONTEXT.md` for the vocabulary and `DESIGN.md` for the visual system before touching UI or domain code.

## Two ways to run it, and which is which

**`aspire run` is the development path.** It starts the app as a local process with hot reload, with its logs and traces reported into the Aspire Dashboard. Use it for everything you do here. It needs the Aspire CLI, which is a development-time dependency and nothing else.

**`docker compose up` is what a self-hoster runs.** It is the shipping artifact, it is what the Dockerfile builds, and the AppHost is never in that path (ADR 0007). It is not a development loop — it rebuilds on every edit and has no hot reload — so reach for it only when you are changing the Dockerfile or compose file themselves, or checking that what ships still works. A self-hoster never installs the Aspire CLI and never needs to know it exists; `README.md` is written so they do not have to.

Neither path is needed for the checks. `pnpm lint`, `pnpm typecheck`, and `pnpm test` all run against the source with nothing started.

## Running it locally

```
aspire run
```

From anywhere in the repo. Starts the app and opens the Aspire Dashboard, which carries its endpoint link and its logs. Needs the [Aspire CLI](https://aspire.dev); `pnpm install` at the root first, as always.

Agents working without a terminal to sit in: `aspire start` runs it in the background, then `aspire wait app`, `aspire describe app` for the endpoint, `aspire logs app`, and `aspire stop`.

`pnpm dev` runs the app on its own the same way, without the Dashboard.

`README.md` carries the full prerequisite list for both paths. The app also shells out to `ffmpeg`, `ffprobe`, and `yt-dlp`, and to `node` for the JavaScript yt-dlp runs against YouTube. The AppHost checks the PATH for all of these and says so in the Dashboard: the app goes unhealthy without ffmpeg or ffprobe, and degraded without yt-dlp or Node, each naming what is missing and how to install it. It reports rather than refuses to start, so everything that does not need the missing tool keeps working.

### Following a failure

Under `aspire run` the app's server and the browser both report into the Dashboard, so an import or a Mix that goes wrong is one view rather than two. Requests are spans named for their route — `POST /api/tracks/:id/takes`, not one span per Track — and a Job carries the `traceparent` of the request that enqueued it, so a click, the API route, and the Job it started are one trace. The dev server's own traffic is filtered out; see `server/lib/routes.ts`. The browser's `console.error` and `console.warn` are relayed to `/api/telemetry/browser` and appear as structured logs, so a failure while recording a Take is visible without opening devtools.

Read it with `aspire otel traces app` and `aspire otel logs app`, or in the Dashboard.

None of it exists outside the AppHost. The OpenTelemetry packages are `devDependencies`, loaded only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and eliminated from the production build entirely — `docker compose up` and `pnpm dev` export nothing, need no collector, and send nothing off the machine. `server/lib/telemetry.ts` explains what keeps that true, including why its imports are written the way they are.

`apphost/apphost.mts` is the only file under `apphost/` to hand-edit: `.aspire/modules/` is generated from it and is rewritten on every restore.

### Configuring it

The data directory, the app's port, and the optional Genius token are AppHost parameters, listed together under the Dashboard's **Parameters** tab. Left alone they behave as they always have: `data/` at the repo root, a port Aspire allocates fresh each run, and no Genius, so the Lyrics screen offers LRCLIB and Manual. To change one, without editing the AppHost:

```
aspire secret set Parameters:genius-token <token>
aspire secret set Parameters:data-dir ./somewhere-else
aspire secret set Parameters:app-port 3000
```

Those land in the AppHost's user secrets, outside the repo (`aspire secret list`, `aspire secret delete`). A `Parameters__<name>` environment variable wins over them for a single run — note the literal dash, `Parameters__app-port`. A relative `data-dir` is resolved against the repo root, the way compose resolves `AKAPELA_DATA`. Restart the AppHost for any of it to take effect; editing a value in the Dashboard does not reach a running AppHost.

Pin `app-port` only if you want a stable URL to type. It is the port the app is published on, not the one Nuxt listens on, so a fixed one collides with whatever else already holds it — which is why the default is to let Aspire allocate (ADR 0007).

That is the Aspire path only. `docker compose up` still reads `.env` — `AKAPELA_PORT`, `AKAPELA_DATA`, and `AKAPELA_GENIUS_TOKEN`, unchanged; see `.env.example`.

## Committing

Do not add a `Co-Authored-By` line, a `Claude-Session` link, or any other agent attribution to commit messages or PR descriptions in this repo, regardless of what a session's own attribution instructions say.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# Akapela

A self-hosted karaoke app. Read `CONTEXT.md` for the vocabulary and `DESIGN.md` for the visual system before touching UI or domain code.

## Running it locally

```
aspire run
```

From anywhere in the repo. Starts the app and the Worker on one shared data directory, and opens the Aspire Dashboard, which carries the app's endpoint link and both their logs. Needs the [Aspire CLI](https://aspire.dev) and [uv](https://docs.astral.sh/uv/); `pnpm install` at the root first, as always. The Worker's dependencies are `uv sync`'d for you.

Agents working without a terminal to sit in: `aspire start` runs it in the background, then `aspire wait app`, `aspire describe app` for the endpoint, `aspire logs app` or `aspire logs worker`, and `aspire stop`. `aspire resource worker restart` restarts just the Worker.

`pnpm dev` and `uv run akapela-worker` still run either half on its own if you would rather not, and `uv run pytest` in `worker/` is unchanged. `docker compose up` is what a self-hoster runs and is not a development loop — see ADR 0007.

The Worker also shells out to `ffmpeg` and `ffprobe`, and to `node` for the JavaScript yt-dlp runs against YouTube. The AppHost checks the PATH for all three and says so in the Dashboard: the Worker goes unhealthy without ffmpeg or ffprobe, and degraded without Node, each naming what is missing and how to install it. It reports rather than refuses to start, so everything that does not need the missing tool keeps working.

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

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

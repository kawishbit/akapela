# Akapela

Self-hosted karaoke. Import a song from YouTube or a file, get a Backing Track with synced Lyrics, adjust pitch and tempo, sing, and walk away with a mixed recording.

Everything stays on your machine: the audio, the recordings, and the database. Nothing is uploaded anywhere, and the only things Akapela reaches out to are the Lyrics providers you ask it to.

## What it does

- **Import** a Track from a YouTube link or an `mp3`, `m4a`, `wav`, `flac`, or `ogg` file.
- **Identify** the Song and fetch its Lyrics from LRCLIB, or from Genius as well if you give it a token, or paste them yourself. Synced Lyrics scroll as you sing; a per-Track Lyrics Offset lines them up when the intro differs from the studio version.
- **Adjust** pitch and tempo, independently or linked.
- **Sing** to the Backing Track and record a Take.
- **Review** the Take: nudge your voice earlier or later against the Backing Track, set the vocal and backing levels, and render a Mix.
- **Download** the Mix as MP3, or as WAV if you want the lossless one.

## Running it

Akapela is two containers sharing one data directory: `app` serves the UI and API, and `worker` runs imports and renders Mixes. Docker with Compose is the only thing you have to install.

```
git clone https://github.com/kawishbit/akapela.git
cd akapela
docker compose up -d
```

Git is the only other thing you need, and only to fetch it.

Then open <http://localhost:3000>.

To configure it, copy `.env.example` to `.env` and edit it:

```
cp .env.example .env
```

- `AKAPELA_PORT` — the host port, `3000` by default.
- `AKAPELA_DATA` — where your library lives. Left unset, it is the named Docker volume `akapela-data`. Set it to a host directory (relative to the compose file, or absolute) if you would rather see the files.
- `AKAPELA_GENIUS_TOKEN` — optional. With a token from [genius.com/api-clients](https://genius.com/api-clients), Genius joins LRCLIB as a place to look Lyrics up, and album art comes from it too. Leave it unset and Genius is simply not offered.

To update, pull and rebuild — plain `docker compose up -d` reuses the image it already built:

```
git pull
docker compose up -d --build
```

The database migrates itself on start, so there is no separate step for that.

**Backups are your job.** Everything — the database, every Track's audio, every Take and Mix — is in that one data directory. Copy it while the stack is stopped.

**There is no login.** Akapela has no accounts and no authentication: anyone who can reach the port can see your library and everything you have recorded. It is built for a machine on your own network. If you want it reachable from outside, put it behind something that asks who you are — a reverse proxy with authentication, or a VPN — and give that the TLS as well.

### Hardware

A machine that can run two containers. `docker-compose.yml` gives the app one core and 512 MB and the Worker two cores and 2 GB, which are a starting point rather than a rule: rendering a Mix of a normal-length song takes a couple of seconds well inside them.

Vocal removal (Separate on a Track) costs more, and only if you ask for it: a few minutes of CPU per song, done one Track at a time in the same queue as everything else so it never competes with a Mix render. Its two Stems add roughly 80 MB per Track on disk, on top of the Track's own audio. The model itself is not in the image — the first separation on a machine downloads it into the data directory, a one-time network fetch that survives `docker compose pull` because it lives on the data volume, not in the container.

## Contributing

Development does not use Compose. It uses an [Aspire](https://aspire.dev) AppHost that starts the app and the Worker as local processes with hot reload, hands them the same data directory, and pools their logs and traces into one Dashboard. It is a development-time tool only: it is not what gets deployed, and a self-hoster never has to install it or know it exists (see [ADR 0007](docs/adr/0007-aspire-for-local-development.md)).

You need:

- **Node 22.19+, 24.11+, or 26+** — Nuxt's supported range, which skips 23 and 25 — and **pnpm**, for which `corepack enable` is enough since the version is pinned in `package.json`.
- **[uv](https://docs.astral.sh/uv/)**, for the Python Worker.
- **The [Aspire CLI](https://aspire.dev)**, for the development path only.
- **Docker**, only if you are changing the Dockerfiles or `docker-compose.yml` and want to check what ships still builds.
- **`ffmpeg` and `ffprobe`** on your PATH. The Worker shells out to them for every import and every Mix. The AppHost checks the PATH when it starts and shows the Worker as unhealthy in the Dashboard naming what is missing, so a missing one is a thing you read at startup rather than an hour later.

Node also does double duty as the JavaScript runtime yt-dlp needs to solve YouTube's player challenges. Without it YouTube imports still work but offer fewer formats, and the Dashboard says so.

Then:

```
pnpm install
aspire run
```

`aspire run` works from anywhere in the repo. It opens the Aspire Dashboard, which carries the app's endpoint link and both processes' logs and traces; the Worker's Python dependencies are `uv sync`'d for you on the way. Give it a minute the first time.

Either half still runs on its own if you would rather — `pnpm dev` for the app, `uv run akapela-worker` for the Worker — but then the data directory and the port are yours to keep in agreement.

The checks, none of which need the AppHost running:

```
pnpm lint
pnpm typecheck
pnpm test
(cd worker && uv run pytest)
```

`AGENTS.md` covers the day-to-day: configuring the AppHost, reading traces, and what the agent-facing conventions are. `CONTEXT.md` is the vocabulary — Track, Song, Take, Mix all mean something specific here, and the code uses those words. `DESIGN.md` is the visual system. `docs/adr/` is why things are the way they are.

## Licence

GPL-3.0-only. See [LICENSE](LICENSE).

Akapela renders Mixes with [Rubber Band](https://breakfastquay.com/rubberband/), which is GPL — see [ADR 0004](docs/adr/0004-rubber-band-and-gpl-license.md) for what that means for this project.

# Contributing

Everything here is for working on the code. To just run Akapela, see the [README](README.md).

## Prerequisites

- **Node 22.19+, 24.11+, or 26+** (Nuxt's supported range, which skips 23 and 25) and **pnpm**. Run `corepack enable` and the version pinned in `package.json` takes care of itself.
- **The [Aspire CLI](https://aspire.dev)**, for local development. It's a development tool only; nothing that ships needs it (ADR 0007).
- **`ffmpeg`** on your PATH. The app calls it for every import and every Mix, and the test suite uses the `ffprobe` that comes with it. The AppHost flags the app as unhealthy in the Dashboard if it's missing.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)** on your PATH, for YouTube imports. Missing, the app still starts and the Dashboard says so. Node doubles as the JavaScript runtime yt-dlp uses against YouTube.
- **Docker**, only if you're changing the Dockerfile or `docker-compose.yml`.

## Running it

```
pnpm install
aspire run
```

`aspire run` works from anywhere in the repo and opens the Aspire Dashboard with a link to the app, its logs, and its traces. `pnpm dev` runs the app on its own without the Dashboard.

None of the checks need anything running:

```
pnpm lint
pnpm typecheck
pnpm test
```

## The desktop shell

`desktop/` starts the same server and points a window at it (ADR 0009), so almost every change belongs in the Nuxt app instead. It's installed and run from inside its own directory, because Electron is a large dependency the root install must never see:

```
cd desktop
pnpm install
AKAPELA_SERVER_URL=http://localhost:3000 pnpm dev
```

That opens a window on a server you're already running, so hot reload and the Dashboard keep working.

## Adding a string

Every word the app shows lives in `i18n/locales/` (ADR 0014), never in a component. Add the key to `en.json`, namespaced by screen or component, and use it with `t('settings.backup.heading')`. English is the source of truth: `pnpm test` fails when a key the app uses is missing from `en.json`. Other Languages may lag behind, and fall back to English one key at a time.

- Build a sentence as one key with placeholders (`"Akapela {version} is available."`), never by joining fragments, since word order differs between Languages. A link or button inside a sentence goes through `<i18n-t>` and a slot.
- Counts use plural forms (`"{count} Track | {count} Tracks"`), not `n === 1 ? … : …`.
- Lyrics, Track titles and artists, and names the singer typed are passed in as parameters and never translated.
- A failure the server sends has a code in `shared/error-codes.ts` and words under `errors.` in `en.json`; the browser shows it through `ErrorMessage.vue`.

Translating into a Language starts from `i18n/glossary.md`, which fixes one rendering for each `CONTEXT.md` term. `pnpm i18n:completeness` reports which keys each Language is missing, and which it still has that English no longer does.

## Where to read next

- `AGENTS.md` — day-to-day development, configuring the AppHost, reading traces, building installers.
- `CONTEXT.md` — the project's vocabulary. Track, Song, Take, and Mix have precise meanings, and the code uses those exact words.
- `DESIGN.md` — the visual design system.
- `ROADMAP.md` — what's planned, and what's still being explored.
- `docs/adr/` — the reasoning behind past decisions.

## Commits and branches

Branches use git-flow prefixes off `main` (`feature/`, `fix/`, `chore/`, `release/`, `hotfix/`). Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/); the PR title decides the release's version bump (ADR 0011).

# Presto

A self-hosted karaoke app. Read `CONTEXT.md` for the vocabulary and `DESIGN.md` for the visual system before touching UI or domain code.

## Running it locally

```
aspire run
```

From anywhere in the repo. Starts the app and opens the Aspire Dashboard, which carries the app's endpoint link and its logs. Needs the [Aspire CLI](https://aspire.dev); `pnpm install` at the root first, as always.

Agents working without a terminal to sit in: `aspire start` runs it in the background, then `aspire wait app`, `aspire describe app` for the endpoint, `aspire logs app`, and `aspire stop`.

`pnpm dev` still runs the app on its own if you would rather not. `docker compose up` is what a self-hoster runs and is not a development loop — see ADR 0007.

`apphost/apphost.mts` is the only file under `apphost/` to hand-edit: `.aspire/modules/` is generated from it and is rewritten on every restore.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

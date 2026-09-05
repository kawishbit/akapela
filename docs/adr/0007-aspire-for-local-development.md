# Aspire orchestrates local development; compose stays the shipping artifact

Akapela is two runtimes that must agree on one data directory (ADR 0002), so local development meant two terminals, two package managers, and a data directory each half resolved for itself — a mismatch that surfaces only as a Job that silently never runs. An Aspire AppHost, in `apphost/` with its own package manifest, starts them as local processes with hot reload intact, hands each the same absolute data directory, allocates ports rather than pinning them, and pools their logs in one dashboard. What a contributor configures — that data directory, the published port, an optional Genius token — is an AppHost parameter, so one place answers what can be changed and nothing has to be exported into a shell or hand-edited into a `.env`. A port can be pinned through that parameter when someone wants a stable URL, which is a deliberate opt-out of the allocation above, not a retreat from it.

It is a development-time overlay and nothing else. `docker compose up` remains what a self-hoster runs and what the Dockerfiles build; the AppHost is never in that path, is not what gets deployed, and adds no dependency to the app's own manifest or lockfile. `pnpm dev` still runs the app alone for anyone who wants neither. The AppHost is authored in TypeScript because this repo is TypeScript and Python, and the Aspire CLI is the only extra tool a contributor installs.

## Considered Options

- A shell script or `concurrently` starting both processes. Rejected: no health, no port allocation, no log correlation, and every contributor's terminal differs.
- Running the compose stack for development. Rejected: rebuilds on every edit and loses hot reload, which is the whole point of a development loop.
- Replacing compose with Aspire's own deployment output. Rejected: self-hosters get one file they can read and edit; Aspire is a tool this project's users should not need.
- An AppHost at the repo root. Rejected: it would merge Aspire's dependencies into the app's manifest and lockfile, and from there into the Docker build.

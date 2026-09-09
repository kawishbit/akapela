# 01: AppHost boots the app under one command

**What to build:** A contributor with a clean clone runs one command and gets the Akapela app running plus the Aspire dashboard, with the library page reachable from the endpoint link the dashboard shows and the app's logs streaming into it. The AppHost is authored in TypeScript and lives in its own directory with its own package manifest, so Aspire's dependencies stay out of the Nuxt app's and cannot disturb `pnpm install`, the lockfile, or the Docker build. `pnpm dev` keeps working exactly as it does today for anyone who does not want the dashboard, and `docker compose up` is untouched.

This ticket also records the decision: Aspire orchestrates local development by running the app and the Worker as hot-reloading local processes; docker compose stays the shipping artifact for self-hosters, as ADR 0002 describes.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A TypeScript AppHost in its own directory declares the Nuxt app as a resource, run through pnpm with hot reload intact
- [x] One documented command starts the app and the dashboard; the dashboard lists the app as healthy with a working endpoint link, and the library page renders through it
- [x] The app's port is Aspire-managed rather than pinned, so repeat runs and a concurrently running `pnpm dev` do not collide
- [x] The app writes to the repo's existing data directory, resolved to an absolute path by the AppHost rather than relying on the process working directory
- [x] The dev server does not auto-open a browser when started by Aspire
- [x] The Nuxt app's package manifest and lockfile gain no Aspire dependencies; `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all behave as before
- [x] Aspire's generated and run-time output is gitignored; the generated modules directory is treated as generated and never hand-edited
- [x] An ADR records Aspire as the local development orchestrator and compose as the shipping artifact, and CONTEXT.md gains any new vocabulary the AppHost introduces

## Comments

Verified by running it: `aspire run` from the repo root finds `apphost/apphost.mts`, and the app reaches Healthy with the library page returning 200 through the Aspire-allocated endpoint. The resource's environment shows `NUXT_DATA_DIR=E:\repositories\akapela\data` (absolute), `BROWSER=none`, and an allocated `PORT` well away from 3000. An edit to the library page appeared through the proxy without a restart, and reverting it took effect the same way, so hot reload survives the proxy.

Two things this ticket did not anticipate:

- The root ESLint config picked up the generated `.aspire/modules/*.mts` and reported 179 errors. `apphost/**` is now ignored at the root; it has its own ESLint config and lint script.
- `apphost/` and `.agents/` are excluded from the Docker build context, so the AppHost never reaches the shipping image.

`aspire init` also drops `.agents/skills/` (its own agent skills, identical to the plugin copies). Those are gitignored as regenerable.

Two review notes acted on: the health check now names `/` rather than leaning on Aspire's default path, and the `BROWSER=none` comment no longer claims Nuxt opens a browser on its own — it does not, unless asked, and the line is there to keep it that way.

Left for later tickets as planned: the Worker is not in the resource graph yet (02), and the data directory and Genius token are still hard-wired rather than AppHost parameters (03).

# 03: Configuration and secrets flow through the AppHost

**What to build:** Everything a contributor has to configure for local development is visible in one place instead of split between a shell export and a compose `.env`. The published port, the data directory, and the optional Genius token become AppHost parameters. Start with no token and Genius is simply not offered, exactly as today; supply the token once through the AppHost and Genius appears as a Lyrics Provider on the next run, with no hand-edited `.env` and no token committed to the repo. The compose path keeps working from `.env` as documented, so self-hosters see no change.

**Blocked by:** 02 (The Worker joins the graph and the Job loop closes)

**Status:** done

- [x] Data directory and app port are AppHost parameters with the same defaults the repo uses today, overridable without editing the AppHost
- [x] The Genius token is an AppHost secret parameter, stored outside the repo, surfaced in the dashboard as a secret rather than as plain text
- [x] With no token configured, the Lyrics screen offers LRCLIB and Manual only; with one configured through the AppHost, Genius joins them
- [x] The existing `.env` and compose environment variables continue to work untouched for the compose path, and `.env.example` still describes them
- [x] Where a value is needed by both the app and the Worker, it is declared once in the AppHost and referenced, not repeated

## Comments

Verified by running it. The Dashboard grows a **Parameters** tab listing `data-dir`, `app-port`, and `genius-token` together, each with a description; `genius-token` shows as a row of dots with a reveal button rather than as text. Left alone: a port allocated well away from 3000, `data dir E:\repositories\akapela\data` in the Worker's log, and `/api/settings` offering `lrclib` and `manual`. With `aspire secret set` for all three: the endpoint moved to the pinned port, `/api/settings` gained `genius`, and a *relative* `./data-override-check` reached both halves as `E:\repositories\akapela\data-override-check` — the app and the Worker cannot be split by an override any more than by the default. Test secrets deleted and the scratch directory removed afterwards.

Three things this ticket did not anticipate:

- **`addParameter`'s `value` is a constant that shadows configuration, not a default it falls back to.** Set `Parameters:data-dir` in user secrets against a parameter declared with a `value` and the secret is ignored outright. So every parameter here reads its own configuration key first and folds the result into that value; `configured()` is the only reason an override works at all, and it is what a review flagged as removable. The experiment that settled it is recorded on the helper, because the next person to tidy it will have the same instinct.
- **The environment-variable form Aspire documents does not work.** The docs say `Parameters__{name}`, "using a single underscore to represent dashes", so `Parameters__app_port`. That silently does nothing; `Parameters__app-port`, with the literal dash, works. AGENTS.md documents the one that works.
- **The port parameter is the *published* port, not the one Nuxt listens on.** `withHttpEndpoint`'s `port` is the proxy's; `targetPort`, which is what `env: 'PORT'` injects, stays Aspire-allocated. That is the right half to pin: it is what the endpoint link carries and what a contributor types, and it leaves 01's collision guarantee intact for the app's own port. Ticket 01 accepted "the app's port is Aspire-managed rather than pinned", so the parameter defaults to empty and pins only when asked, and ADR 0007 now records that opt-out rather than being left to contradict it silently.

The Worker is deliberately not handed the Genius token: it does no Lyrics work. `.env`, `.env.example`, and `docker-compose.yml` are untouched, and the app still reads `AKAPELA_GENIUS_TOKEN` from the process environment, so a self-hoster setting it on a running container is unaffected.

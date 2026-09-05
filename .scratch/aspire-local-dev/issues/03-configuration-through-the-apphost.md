# 03: Configuration and secrets flow through the AppHost

**What to build:** Everything a contributor has to configure for local development is visible in one place instead of split between a shell export and a compose `.env`. The published port, the data directory, and the optional Genius token become AppHost parameters. Start with no token and Genius is simply not offered, exactly as today; supply the token once through the AppHost and Genius appears as a Lyrics Provider on the next run, with no hand-edited `.env` and no token committed to the repo. The compose path keeps working from `.env` as documented, so self-hosters see no change.

**Blocked by:** 02 (The Worker joins the graph and the Job loop closes)

**Status:** ready-for-agent

- [ ] Data directory and app port are AppHost parameters with the same defaults the repo uses today, overridable without editing the AppHost
- [ ] The Genius token is an AppHost secret parameter, stored outside the repo, surfaced in the dashboard as a secret rather than as plain text
- [ ] With no token configured, the Lyrics screen offers LRCLIB and Manual only; with one configured through the AppHost, Genius joins them
- [ ] The existing `.env` and compose environment variables continue to work untouched for the compose path, and `.env.example` still describes them
- [ ] Where a value is needed by both the app and the Worker, it is declared once in the AppHost and referenced, not repeated

# 06: Onboarding pass

**What to build:** The whole thing verified from the outside: a clean clone reaches a running app and Worker with one command, and both paths are written down so nobody has to guess which to use. A contributor reads that Aspire is for development and compose is for self-hosting, and a self-hoster reading the compose docs never has to care that Aspire exists.

**Blocked by:** 03 (Configuration and secrets flow through the AppHost), 04 (Prerequisites fail loudly, not mysteriously), 05 (Telemetry lands in one place)

**Status:** ready-for-agent

- [ ] From a clean clone, the documented setup and one start command reach a working app and Worker, walked through start to finish rather than assumed
- [ ] The full local loop is exercised once under the AppHost: import a Track, identify the Song and fetch Lyrics, adjust and sing, record a Take, review it, render a Mix, download it
- [ ] AGENTS.md and the README state both paths and when to use each, including the Aspire CLI as a prerequisite for the development path only
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the Worker's tests all pass and none of them require the AppHost
- [ ] `docker compose up` still works from a clean clone with no Aspire tooling installed

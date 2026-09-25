# 04: Version skew

**What to build:** A guard for the one mismatch that actually breaks.

Connected, the whole UI comes from the server while the title bar, the preload bridge (`preload.cts`), and the update check stay in the shell. So a server **newer** than the shell can serve an app that expects a bridge channel this shell does not have — a blank area, a dead button, or a thrown error with no explanation.

On connect, the shell reads the server's version and compares it with its own:

- **Server newer than the shell:** refuse to load, on a shell-rendered screen that names both versions, says the app needs updating, and offers the Update (the existing update path) plus **Change server…**.
- **Server older, or equal:** load, silently. Older is the safe direction — the served app can only ask for bridge methods that already existed — and nagging about it would punish a household that updates its laptop first.

Compare by Release version (`vMAJOR.MINOR.PATCH`, ADR 0011). The comparison is a plain function with no Electron import, covered by `tests/unit/desktop/`, including a server that reports no version at all (treat as older, since only a newer one is dangerous) and a version that doesn't parse.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A server newer than the shell is refused, naming both versions, offering the Update and Change server…
- [ ] An older or equal server loads with no warning
- [ ] A server that reports no version, or an unparseable one, loads rather than blocking
- [ ] The comparison is a plain tested function, including pre-release and multi-digit versions
- [ ] The check happens on connect and on a reconnect, not only at first launch
- [ ] **Use this computer** mode is unaffected — there is nothing to compare
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

# 04: Real Separation progress

**What to build:** A Separation reports a real percentage instead of three milestones.

Today `server/lib/jobs/separate.ts` sets progress at started, model ready, and stems written, so a ten-minute Separation sits at one number for most of its life. The song is already cut into overlapping chunks and run one after another, so the honest number is chunks done out of total.

`separate-cli.ts` writes one line per chunk to **stdout** — `progress <done>/<total>` — and the handler parses it and maps it into a band between the existing milestones (model ready → stems written). stdout because it is the simplest channel, it behaves the same under `ELECTRON_RUN_AS_NODE=1`, and stderr stays free for the error message the handler already collects.

Parsing must be forgiving: an unrecognised stdout line is ignored, and a subprocess that never reports still finishes normally on its milestones alone.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] The Track page's Separation progress moves steadily while a Separation runs
- [ ] The percentage is monotonic and never exceeds the stems-written milestone before the Stems exist
- [ ] Unparsable or absent stdout progress does not fail the Job
- [ ] Nothing is written to the Job row per chunk more often than is reasonable for a long song (batch or throttle if a chunk is quick)
- [ ] The error path is unchanged: stderr still carries the reason on a failure
- [ ] Tests cover the parser and the mapping into the band
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

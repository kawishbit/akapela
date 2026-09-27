# 01: Two Lanes in the runner

**What to build:** ADR 0012 made real. Jobs run in two **Lanes** side by side: the heavy Lane runs Separations, the light Lane runs everything else (imports, Mixes, `noop`). Each Lane still claims one Job at a time, in creation order, from the same `jobs` table.

`JobsRunner` takes the Lane as a constructor option and filters `claimNext` by it — `type = 'separate'` for heavy, `type != 'separate'` for light. The Lane is derived from the Job type and is never a column on the row. `server/plugins/jobs-runner.ts` calls `recoverStaleJobs()` once, before starting either loop, so a process that died mid-Job does not have both Lanes requeueing the same rows.

Everything else about the runner — telemetry spans, progress, the terminal UPDATEs, `runForever`'s abort on shutdown — is untouched.

Add the Lane to `CONTEXT.md` only if the existing entry needs sharpening; it is already written.

**Blocked by:** None

**Status:** done

- [x] Two Lanes run concurrently: a queued Mix starts while a Separation is running
- [x] Each Lane runs one Job at a time, in creation order; two Separations never run at once
- [x] `recoverStaleJobs()` runs once at startup, not once per Lane
- [x] A Job type added later lands in the light Lane without touching the heavy one
- [x] `tests/unit/jobs-runner.test.ts` covers the lane filter in `claimNext` and the two loops not claiming each other's Jobs
- [x] `ROADMAP.md` item 1 and ADR 0012 say the Lanes are built rather than decided
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

# 01: The Worker is gone: fix the glossary

**What to build:** `CONTEXT.md` still describes a process that no longer exists. **Worker** is defined as "the separate process that runs Jobs one at a time, in the order they were created"; **Job** is defined as work "handed from the app to the Worker"; **AppHost** "starts the app and the Worker together"; **Trace** follows a request into "the Worker running that Job". Worker-to-TypeScript deleted the Python worker — every Job now runs in the app process (`server/plugins/jobs-runner.ts`), `apphost/apphost.mts` says outright that it "starts one process because there is only one to start", and ADR 0002 and ADR 0007 both carry amendments recording the change. The ADRs were updated; the glossary was not.

This lands first because every ticket after it says "the server process" and needs that to mean exactly one thing. Getting it wrong here would put a supervision design (ticket 04) on top of a vocabulary that implies two processes to supervise.

Glossary only. No code changes, no ADR — the decision is already recorded twice; this is the glossary catching up.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The **Worker** entry is removed from `CONTEXT.md`
- [ ] **Job** is redefined as work the app runs itself, keeping the queued/running/succeeded/failed lifecycle and the one-at-a-time, creation-order guarantee that the Worker entry used to carry — that behaviour is still true, it just belongs to the app now
- [ ] **AppHost** and **Trace** lose their Worker clauses without losing their meaning
- [ ] Nothing else in `CONTEXT.md` still implies a second process; `grep -n Worker CONTEXT.md` comes back empty
- [ ] Ordinary uses of "worker" elsewhere are left alone — `AudioWorklet`, `worker_threads`, Workbox, and the historical references inside `docs/adr/` and `.scratch/` are all correct as written and are not part of this

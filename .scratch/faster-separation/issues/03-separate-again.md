# 03: Separate again with another Separation Model

**What to build:** A Track that already has Stems can be separated again with a different Separation Model, from the Track page.

- Next to "Separated with Inst_Main", a **Separate again** action opens a choice of the other catalog models and queues a Separation with the one chosen.
- While it runs, the Track keeps its current Stems and can still be sung over them. They are replaced only when the new Separation succeeds. Cancelling or failing leaves the old Stems and their recorded model exactly as they were. This is the Jobs page's existing "back to the Stems it had" rule.
- Separating again with the model that made the current Stems isn't offered.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Separate again lists every catalog model except the current one
- [ ] The old Stems stay playable while the new Separation runs
- [ ] Success replaces the Stems and the recorded model together
- [ ] Cancel or failure leaves Stems and model untouched
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

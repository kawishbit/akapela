# 03: Separate again with another Separation Model

**What to build:** A Track that already has Stems can be separated again with a different Separation Model, from the Track page.

- Next to "Separated with Inst_Main", a **Separate again** action opens a choice of the other catalog models and queues a Separation with the one chosen.
- While it runs, the Track keeps its current Stems and can still be sung over them. They are replaced only when the new Separation succeeds. Cancelling or failing leaves the old Stems and their recorded model exactly as they were. This is the Jobs page's existing "back to the Stems it had" rule.
- Separating again with the model that made the current Stems isn't offered.

**Blocked by:** 02

**Status:** done

- [x] Separate again lists every catalog model except the current one
- [x] The old Stems stay playable while the new Separation runs
- [x] Success replaces the Stems and the recorded model together
- [x] Cancel or failure leaves Stems and model untouched
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29: The Stems panel's existing Separate again button now opens the other catalog models (`otherSeparationModels`). The keep-until-replaced behaviour was already the separate Job's: it writes into `stems.part/` and renames at the end, and `stems_model` is written in the same statement that marks the Track ready. Cancel and failure never touch either. One gap was fixed along the way: `separate/retry` used to ask with whatever the default had become, and now retries with the model the failed Separation was asked for, as a retry from the Jobs page does.

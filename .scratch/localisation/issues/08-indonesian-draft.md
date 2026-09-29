# 08: Draft `id.json`, the glossary, and the completeness report

**What to build:** A complete Indonesian translation, ready for review.

- **Glossary first:** `i18n/glossary.md`, with one agreed Indonesian rendering for each `CONTEXT.md` term the UI shows (Track, Take, Mix, Stems, Queue, Queue Entry, Up next, Job, Lyrics, Lyrics Offset, Backing Track, Separation, Preset, Adjustments, Effects, ...). Each entry has a one-line reason where the choice isn't obvious, and lists the synonyms to avoid, mirroring `CONTEXT.md`'s _Avoid_ lines. Service and format names are not translated. Link it from `CONTRIBUTING.md`'s "Adding a string" note, as the first thing a new translator reads.
- **`id.json`:** every key in `en.json`, translated using the glossary. Pick one register (*kamu* or *Anda*) and record it at the top of the glossary so it stays consistent.
- **The completeness script** (`scripts/`): for each Language other than English, it reports missing keys and keys that no longer exist in `en.json`. It reports and never fails the suite.
- **Flag for the reviewer**, in this ticket's Comments: any string whose translation was a judgement call, and the question of built-in Preset names (spec: Decisions).

**Blocked by:** 02, 03, 04, 05, 07

**Status:** ready-for-agent

- [ ] The completeness script reports Indonesian at 100% with no stale keys
- [ ] Every screen checked in Indonesian at phone width: nothing truncated or overflowing (Indonesian runs longer than English)
- [ ] Glossary terms are used consistently across `id.json`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

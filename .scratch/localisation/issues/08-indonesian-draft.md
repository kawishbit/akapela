# 08: Draft `id.json`, the glossary, and the completeness report

**What to build:** A complete Indonesian translation, ready for review.

- **Glossary first:** `i18n/glossary.md`, with one agreed Indonesian rendering for each `CONTEXT.md` term the UI shows (Track, Take, Mix, Stems, Queue, Queue Entry, Up next, Job, Lyrics, Lyrics Offset, Backing Track, Separation, Preset, Adjustments, Effects, ...). Each entry has a one-line reason where the choice isn't obvious, and lists the synonyms to avoid, mirroring `CONTEXT.md`'s _Avoid_ lines. Service and format names are not translated. Link it from `CONTRIBUTING.md`'s "Adding a string" note, as the first thing a new translator reads.
- **`id.json`:** every key in `en.json`, translated using the glossary. Pick one register (*kamu* or *Anda*) and record it at the top of the glossary so it stays consistent.
- **The completeness script** (`scripts/`): for each Language other than English, it reports missing keys and keys that no longer exist in `en.json`. It reports and never fails the suite.
- **Flag for the reviewer**, in this ticket's Comments: any string whose translation was a judgement call, and the question of built-in Preset names (spec: Decisions).

**Blocked by:** 02, 03, 04, 05, 07

**Status:** done

- [x] The completeness script reports Indonesian at 100% with no stale keys
- [x] Every screen checked in Indonesian at phone width: nothing truncated or overflowing (Indonesian runs longer than English)
- [x] Glossary terms are used consistently across `id.json`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Done**, ready for review in ticket 09.

- `i18n/glossary.md` comes first. `CONTRIBUTING.md`'s "Adding a string" note points to it.
- `id.json` covers all 480 keys: `pnpm i18n:completeness` reports `id: 100% (480 of 480)` with nothing stale.
- `tests/unit/i18n-keys.test.ts` compiles every message in every Language, and fails on a placeholder English doesn't fill in.
- Checked at 390px in Chrome, in Indonesian: Library, Settings, Jobs (with a real failed import), Queue, Track, and Sing. None of them scrolls sideways, and the only clipped text is Track and Song titles, which truncate by design. The Review page wasn't checked, since there was no Take to open.

**For the reviewer:** judgement calls, all recorded in the glossary.

- **Register: *kamu*.** It's a karaoke app used with friends. *Anda* would read like a bank.
- **Track = *Trek*, Song = *Lagu*.** This keeps the two apart the way English does. The catch is that "lagu" is what most people would say for both.
- **Loanwords kept:**
  - *Take*, *Mix*, *Preset* and *Stem*;
  - *Monitoring*, *Reverb* and *Low-pass*;
  - *Offset Lirik*.

  The alternatives either blur a distinction (*rekaman* for Take is also the audio file) or read as a movement rather than a setting (*pergeseran lirik*).
- **Capitalised terms mid-sentence** (*Trek*, *Antrean*, *Pustaka*) mirror the English. It's unusual in Indonesian, and easy to drop across the file if it reads wrong.
- **Job activity *Mixing*** stays as the loanword, next to *Mengimpor* and *Memisahkan*. So do the buttons *Render* and *Render Mix*, with *merender* in running text.
- **Lyrics Provider *Manual*** is the same word in Indonesian, so it reads unchanged.
- **"Waiting for worker" = *Menunggu giliran*** ("waiting for its turn"). "Worker" means nothing to a singer.
- **The Lyrics placeholder** is still the English "Yesterday" line. An Indonesian song's first lines might be friendlier.
- **Built-in Preset names** (Slowed and Reverb, Nightcore, Practice) stay English, as the spec says. Decide in ticket 09.

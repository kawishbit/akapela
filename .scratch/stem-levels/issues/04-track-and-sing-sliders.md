# 04: Sliders on the Track page and the Sing screen

**What to build:** Two sliders, **Guide Vocal** and **Instrumental** (0–100%), wherever the singer chooses what to sing over before and during a Take.

- **Track page, Stems panel** (`app/components/StemsPanel.vue`): the Backing Source switch reads Original / Stems. The sliders sit under it and are enabled when the Track has Stems. They stay visible (disabled) while the Backing Source is Original, so the remembered levels can be seen, but not while it has never been separated.
- **Sing screen** (`app/pages/tracks/[id]/sing.vue`): the same sliders, live while playing and while recording. The Backing Source line (`sing.vue:193`) says "Stems · Guide Vocal 30%" or similar, and just "Stems" at 0/100.
- **Sing choice dialog** (`SingChoiceDialog.vue`): unchanged in shape. It offers Original or Stems, and Stems uses the Track's remembered levels.

Both sliders go through `usePlayer().setStemLevels` (ticket 03), so moving one is heard live and remembered on the Track. Follow `DESIGN.md` for the slider's look. Reuse whatever slider the Adjustments panel already uses.

Strings (labels, the aria text, the Backing Source names `original`/`stems`) go into `en.json` and `id.json`, and "Guide Vocal" and "Stem Levels" go into `i18n/glossary.md`.

**Blocked by:** 01, 03

**Status:** done

- [x] The Stems panel shows Original / Stems, and the sliders when Stems exist
- [x] Moving a slider is heard live and survives a page reload
- [x] The Sing screen's sliders work during playback and during recording
- [x] The Sing choice dialog still starts singing in one tap
- [x] Keyboard and screen-reader accessible (labelled sliders, value announced as a percentage)
- [x] English and Indonesian strings, and glossary entries
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

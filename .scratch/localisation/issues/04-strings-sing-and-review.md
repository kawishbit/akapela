# 04: Strings: singing and review

**What to build:** Move every user-facing string in these files into `en.json`, following the pattern ticket 01 set on the Settings page: `pages/tracks/[id]/sing.vue`, `pages/tracks/[id]/takes/[takeId].vue`, `RecordControl`, `AdjustmentsPanel`, `PlayerBar`, `LyricsOffsetControl`, `UpNextPrompt`, and `SingChoiceDialog`. Also the failures the browser raises itself in `useTakeRecorder`, `useTakeReview`, `usePlayer`, and `app/audio/` (microphone permission, the audio engine): those are ordinary translated strings, not server codes. Built-in Preset names stay as stored (spec: Decisions).

Keys are namespaced by screen or component. Anything built by joining sentence fragments becomes one key with interpolation, because word order differs between Languages. Counts use the i18n library's plural forms, not `n === 1 ? … : …`. Names the singer typed, Track titles and artists, and Lyrics are inserted as parameters and never translated.

Don't add Indonesian here. `id.json` is ticket 08, done once every key exists.

**Blocked by:** 01

**Status:** done

- [x] No hardcoded user-facing English is left in the listed files (aria-labels and `title` attributes included)
- [x] With `id.json` stubbed to a few keys, the screens render with English fallback and no raw keys
- [x] The key-coverage test passes
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Done.** The failures the browser raises are translated strings:
- microphone refused or missing (`NotAllowedError`, `NotFoundError`);
- the audio engine or capture stopping;
- a Take upload or Backing Track load failing.

The engine's own message sits under Details. `formatLowpassHz` now takes the word for Off. Built-in Preset names are shown as stored.

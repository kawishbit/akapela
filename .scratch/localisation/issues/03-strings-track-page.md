# 03: Strings: the Track page

**What to build:** Move every user-facing string in these files into `en.json`, following the pattern ticket 01 set on the Settings page: `pages/tracks/[id]/index.vue`, `SongPanel`, `LyricsPanel`, `LyricsView`'s empty states, `StemsPanel` (the Separation states and the text around the Separation Model names; the model ids themselves stay as they are), `TakesPanel`, `MixList`, and `AudioPlayer`.

Keys are namespaced by screen or component. Anything built by joining sentence fragments becomes one key with interpolation, because word order differs between Languages. Counts use the i18n library's plural forms, not `n === 1 ? … : …`. Names the singer typed, Track titles and artists, and Lyrics are inserted as parameters and never translated.

Don't add Indonesian here. `id.json` is ticket 08, done once every key exists.

**Blocked by:** 01

**Status:** done

- [x] No hardcoded user-facing English is left in the listed files (aria-labels and `title` attributes included)
- [x] With `id.json` stubbed to a few keys, the screens render with English fallback and no raw keys
- [x] The key-coverage test passes
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Done.** The Separation Model descriptions moved into `en.json` under `separationModels.descriptions.<name>`, and a test checks that every model in the catalog has one. The model names themselves stay as they are. A Lyrics Provider failure on a Track now also comes back as `lyricsFailure` (a code), next to the English `lyricsError`.

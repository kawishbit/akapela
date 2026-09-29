# 02: Strings: the Library and the app's shell

**What to build:** Move every user-facing string in these files into `en.json`, following the pattern ticket 01 set on the Settings page: `app.vue`, `error.vue`, `pages/index.vue`, `TrackCard`, `TitleBar`, `JobsLink`, `QueueLink`, `ConfirmDialog`, `TrackEditDialog`, `UpdatePrompt`, and the import flow on the Library page. Page titles too.

Keys are namespaced by screen or component. Anything built by joining sentence fragments becomes one key with interpolation, because word order differs between Languages. Counts use the i18n library's plural forms, not `n === 1 ? … : …`. Names the singer typed, Track titles and artists, and Lyrics are inserted as parameters and never translated.

Don't add Indonesian here. `id.json` is ticket 08, done once every key exists.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] No hardcoded user-facing English is left in the listed files (aria-labels and `title` attributes included)
- [ ] With `id.json` stubbed to a few keys, the screens render with English fallback and no raw keys
- [ ] The key-coverage test passes
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

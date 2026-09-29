# 05: Strings: Queue, Jobs, and Settings

**What to build:** Move every user-facing string in these files into `en.json`, following the pattern ticket 01 set on the Settings page: `pages/queue.vue`, `QueueRow`, `QueueAddSong`, `AddToQueueDialog`, `pages/jobs.vue`, `JobRow` (Job types and states; the failure text itself is ticket 06), `app/utils/jobs.ts`, `app/utils/queue.ts`, and whatever of `pages/settings.vue` ticket 01 didn't already move.

Keys are namespaced by screen or component. Anything built by joining sentence fragments becomes one key with interpolation, because word order differs between Languages. Counts use the i18n library's plural forms, not `n === 1 ? … : …`. Names the singer typed, Track titles and artists, and Lyrics are inserted as parameters and never translated.

Don't add Indonesian here. `id.json` is ticket 08, done once every key exists.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] No hardcoded user-facing English is left in the listed files (aria-labels and `title` attributes included)
- [ ] With `id.json` stubbed to a few keys, the screens render with English fallback and no raw keys
- [ ] The key-coverage test passes
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

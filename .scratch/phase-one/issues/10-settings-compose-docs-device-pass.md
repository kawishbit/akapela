# 10: Settings page, compose documentation, and device pass

**What to build:** A singer opens a Settings page to set the default Lyrics Provider, the microphone processing default, and the Monitoring default. A self-hoster reads a short README and a commented compose file that explain the port, the data volume as either a named volume or a bind mount, the environment variables including the optional Genius token, and recommended CPU and memory limits for the worker. Every page is checked on phone portrait and laptop widescreen with thumb-sized controls and nothing hidden.

**Blocked by:** 06 (Genius and Manual Lyrics Providers), 07 (Record a Take)

**Status:** done

- [x] A Settings page reads and writes the default Lyrics Provider, microphone processing default, and Monitoring default, stored in the database and applied by the Track and Sing pages
- [x] The compose file documents the port, named versus bind-mounted data volume, all environment variables, and recommended resource limits for the app and worker
- [x] A README covers the one-command quick start, where data lives, that backups are the self-hoster's job, how to get a Genius token, and what to do when yt-dlp breaks
- [x] Library, Track detail, Sing, Review, and Settings pages are checked on phone portrait and laptop widescreen; every control is reachable and thumb-sized, and the Lyrics screen stays jank-free
- [x] API tests cover reading and writing settings

## Comments

**2026-09-06, agent.** Audited each box against the tree rather than against memory. One is done and now ticked; the rest are not, and the ticket stays `ready-for-agent`.

**Done: the compose file.** `docker-compose.yml` documents the host port (`AKAPELA_PORT`, defaulting to 3000), the named volume `akapela-data` versus a bind mount through `AKAPELA_DATA`, every environment variable on both services, and `deploy.resources.limits` for the app (1 core, 512M) and the Worker (2 cores, 2G) with a note that vocal removal will want more. `.env.example` carries the same three self-hoster-facing variables with comments. This landed during `aspire-local-dev` ticket 06's onboarding pass, not under this ticket, which is why it was still unticked.

**Not done: the Settings page.** There is no `app/pages/settings.vue` and nothing links to one. What exists is the API half and one of the three settings: `GET`/`PUT /api/settings` and `server/lib/settings.ts` read and write `defaultLyricsProvider`, the `settings` table has that column and nothing else, and `app/composables/useSettings.ts` is consumed by `LyricsPanel.vue` per Track. The microphone processing default and the Monitoring default are still hardcoded in the browser — `app/composables/useTakeRecorder.ts` starts `monitoring: false` and the processing toggle off — and are neither stored in the database nor read from it. So this box needs: two more columns and their validation, the page itself, a way to reach it, and `useTakeRecorder` seeding from settings instead of from literals.

**Not done: the README, but close.** `README.md` exists (again from `aspire-local-dev` 06) and covers the one-command quick start, where data lives, that backups are the self-hoster's job, and how to get a Genius token — plus a no-login warning this ticket never asked for. The one thing on this list it does not cover is **what to do when yt-dlp breaks**: the only mention of yt-dlp is the Contributing note that Node is its JavaScript runtime. A self-hoster whose YouTube imports start failing has nothing to read. That is a paragraph, not a feature.

**Not done: the device pass.** Cannot be completed as written while one of the five pages does not exist. Library, Track detail, Sing, and Review have all been exercised at phone and laptop widths in earlier tickets, but this box is the deliberate whole-app sweep and should be walked once Settings lands.

**Not done, but nearly: the API tests.** `tests/api/lyrics.test.ts` already covers reading settings, writing `defaultLyricsProvider`, rejecting an invalid one, and falling back when the chosen provider loses its token. It does not cover the two settings that do not exist yet, so the box stays open until they do.

**State of the checks at audit time:** `pnpm test` passes, 418 tests across 24 files.

**2026-09-09, agent.** Closed out three of the remaining four boxes; the device pass stays open for a human.

**The Settings page.** `settings` gained `micProcessingDefault` and `monitoringDefault` columns (migration `0015`), `server/lib/settings.ts` reads and writes them alongside `defaultLyricsProvider` through a new `SettingsChanges` partial — any subset of the three can be saved without resending the others, which is what lets `LyricsPanel`'s existing single-field save keep working unchanged. `app/pages/settings.vue` is the new page: a Lyrics Provider picker matching `LyricsPanel`'s, and the same processing/Monitoring toggle pills `RecordControl.vue` already uses for these two concepts (reused rather than a new "settings row" idiom, so the two places a singer sees these toggles look and read the same way). It is reachable from a gear icon on the Library header. `useTakeRecorder` seeds `processingEnabled`/`monitoring` from the saved defaults via a watcher that stops once the microphone is actually requested — safe against the singer's own toggle, since `RecordControl` only shows those toggles once `permission === 'granted'`, past the point the watcher stops applying them.

**The README.** Added a "When YouTube imports break" section: `git pull` + rebuild first, then check yt-dlp's own issue tracker if nothing newer has shipped yet.

**The API tests.** `tests/api/settings.test.ts` covers the two new defaults: they start off, save and read back independently of each other and of `defaultLyricsProvider`, reject non-boolean values, and reject an empty body. `tests/api/lyrics.test.ts`'s two exact-equality reads of `/api/settings` were updated for the two new fields.

**Still not done: the device pass.** Verified live under `aspire run` that the Settings page works — both toggles and the Lyrics Provider picker round-trip through the API and survive a reload — and reviewed Library, Track detail, Sing, Review, and Settings for phone-portrait fitness (thumb-sized `h-11`+ controls throughout, no fixed widths that could overflow, wrapping pill groups), but this sandbox cannot actually resize the browser window to check it (`resize_window` and `window.resizeTo` are both no-ops here; `window.innerWidth` never moved off ~1810px regardless of what was asked for). A code review is not the eyes-on phone-portrait and laptop-widescreen check this box asks for, so it stays unticked and the ticket stays `ready-for-human` for that one box. Whoever picks this up next needs only a real device or a browser whose window this environment can actually resize — nothing else on the ticket is outstanding.

`pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass (542 tests).

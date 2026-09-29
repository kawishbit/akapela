# 01: i18n plumbing and the Language picker

**What to build:** `@nuxtjs/i18n` wired in, with English only in real use and an Indonesian file present but nearly empty. The Language picker works, and the key-coverage test exists.

- Add `@nuxtjs/i18n`. Locale files at `i18n/locales/en.json` and `id.json`, lazy-loaded. `strategy: 'no_prefix'`, and the chosen Language persisted in a cookie. Browser detection maps `id` and `id-*` to Indonesian and everything else to English. English is the fallback Language.
- `<html lang>` follows the chosen Language. Remove the hardcoded `lang: 'en'` from `nuxt.config.ts`.
- The Language picker goes on the Settings page: *Automatic (browser language)*, *English*, *Bahasa Indonesia*, each Language named in its own words. Automatic clears the cookie. A line says it applies to this device only. It is not a server Setting and never goes through `settings.put`.
- Dates and numbers: `app/utils/format.ts` and `app/utils/jobs.ts` format with the chosen Language's locale instead of `undefined`.
- Key-coverage test (root vitest): every translation key referenced in `app/` exists in `en.json`. Ticket 06 extends it to error codes. Decide how keys are extracted, whether by static scan of `t('…')`/`$t('…')` or by typed keys, and write the choice down in the test.
- Move the Settings page's own strings as the worked example that tickets 02–05 copy.
- `CONTRIBUTING.md`: a short "Adding a string" note. Keys go in `en.json`, and other Languages fall back.

**Blocked by:** None

**Status:** done

- [x] Opening the app with an Indonesian browser selects Indonesian, and a Malay or French browser selects English
- [x] Picking a Language survives a reload and renders server-side in that Language (no flash of English)
- [x] Picking Automatic clears the cookie, and the browser's language applies again
- [x] Two devices can hold different Languages at once
- [x] URLs have no Language prefix
- [x] `<html lang>` matches the chosen Language
- [x] A date on the Settings or Jobs page follows the chosen Language, not the browser's locale
- [x] The key-coverage test fails when a referenced key is missing from `en.json`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Done.**

- `@nuxtjs/i18n` with `i18n/locales/en.json` and `id.json`, lazy-loaded, `strategy: 'no_prefix'`.
- The module's own browser detection is off, because it writes its cookie as soon as it detects a Language, and then Automatic could never be told apart from a choice. `app/plugins/language.ts` settles the Language through the `i18n:beforeLocaleSwitch` hook instead: the `akapela-language` cookie when there is one, `Accept-Language` on the server otherwise. The browser takes the server's answer from the payload, so the page renders in the Language with no flash of English.
- `app/utils/language.ts` holds the rules, with unit tests. The first of the browser's languages that Akapela has wins, `id`/`id-*` is Indonesian, and `ms`, `fr` and anything else fall to English.
- `useLanguage()` backs the picker on the Settings page. Automatic clears the cookie and switches to the browser's Language. `<html lang>` follows it, in `app.vue` and `error.vue`.
- Dates: `formatDate(ms, locale)` and `takeLabel(take, t, locale)`. The test checks that Indonesian writes `14.03` whatever the browser's locale.
- Key coverage (`tests/unit/i18n-keys.test.ts`) is a static scan of `app/`, since it has to run without building Nuxt. How the scan works is written at the top of the file.
- Checked in Chrome against the dev server:
  - an `id` Accept-Language renders Indonesian on the server, and `ms-MY` renders English;
  - the cookie wins over the header;
  - no `Set-Cookie` is sent until the singer picks;
  - picking survives a reload;
  - Automatic clears the cookie.

One hydration warning from `AddToQueueDialog` (a comment node on the server, a div in the browser) appeared on reload. It comes from its `<Teleport>`, not from the Language.

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

**Status:** ready-for-agent

- [ ] Opening the app with an Indonesian browser selects Indonesian, and a Malay or French browser selects English
- [ ] Picking a Language survives a reload and renders server-side in that Language (no flash of English)
- [ ] Picking Automatic clears the cookie, and the browser's language applies again
- [ ] Two devices can hold different Languages at once
- [ ] URLs have no Language prefix
- [ ] `<html lang>` matches the chosen Language
- [ ] A date on the Settings or Jobs page follows the chosen Language, not the browser's locale
- [ ] The key-coverage test fails when a referenced key is missing from `en.json`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

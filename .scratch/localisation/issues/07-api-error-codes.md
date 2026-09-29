# 07: Error codes for API routes

**What to build:** Every error an API route can hand the UI carries a code from the list ticket 06 created.

- Each `createError` in `server/api/` (about 120) keeps its English `statusMessage` for logs and the Dashboard, and adds `data: { code, params }`. Where a finer distinction wouldn't change what the singer does next, several routes share one code (a not-found family, a validation code with a field param, and so on). Messages shared through `shared/`, such as `DUPLICATE_PRESET_NAME_MESSAGE` and `RESTORE_NEEDS_CONFIRMATION_MESSAGE`, become codes.
- One browser helper turns a fetch error into display text: the translated code if there is one, otherwise `unexpected` with the `statusMessage` as Details. Every place in `app/` that currently shows `statusMessage` or `data.message` goes through it.
- Errors caught by `error.vue` (a 404 page, a 500) go through the same helper.

**Blocked by:** 06

**Status:** done

- [x] No route hands the UI an English sentence as the thing a singer reads
- [x] A 500 from an uncaught exception shows "Something went wrong" with Details
- [x] Nothing in `app/` reads `statusMessage` directly for display anymore
- [x] The key-coverage test passes with every new code
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Done.**

- Every `createError` in `server/api/` and the `require-*` helpers goes through `apiError(status, failure(code), statusMessage)` (`server/lib/api-error.ts`), and the English `statusMessage` is unchanged.
- Codes are shared where the singer's next step is the same. The `*NotFound` family covers something deleted elsewhere. `invalidRequest` covers what the app's own screens never send, and keeps its English as Details.
- `JobActionRefused` and `LyricsProviderError` carry their own codes.
- In `app/`, `describeError()` is the only place that reads `statusMessage`, and only as Details. `error.vue` goes through it too.
- `tests/api/error-codes.test.ts` checks the body shape through the real routes. The cover tests check `coverTooLarge`'s parameter.

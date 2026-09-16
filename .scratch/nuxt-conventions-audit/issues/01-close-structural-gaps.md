# 01: Close the specific structural gaps

**What to build:** The two Nuxt-convention pieces `app/` was actually missing, and nothing else.

`app/` already follows Nuxt 4's directory-structure doc (`srcDir` default, top-level `shared/`, conventional `server/`). Rather than reshuffle a layout that already matches convention, this closes only the concrete, generally-useful gaps found during the audit.

**Status:** done

- [x] `app/error.vue` — Nuxt has no custom error page today, so any unhandled error (or a thrown `createError` not caught by a page) falls through to Nuxt's default error overlay. Added one that matches the app's dark/light theme (`useTheme`), distinguishes 404 from other errors, and offers a way back to the library. Most predictable errors (e.g. a missing Track) are already handled in-page via `useTrackDetail`'s `notFound` flag — this is the catch-all for what isn't.
- [x] `app.config.ts` — considered and rejected. Everything in `nuxt.config.ts`'s `runtimeConfig` (`dataDir`, `migrationsDir`, `telemetryEnabled`) is either server-only or environment-derived; there is no non-secret, build-time config that would actually benefit from living in `app.config.ts` instead. Not adding a file with nothing in it.

## Comments

`app/error.vue` reuses the app's existing Tailwind tokens (`bg-ground`, `text-negative`, `bg-accent`/`text-accent-ink`) and calls `clearError({ redirect: '/' })` rather than a plain link, since Nuxt's error state needs to be explicitly cleared. `pnpm lint`, `pnpm typecheck` (root), and `pnpm test` all pass with the file in place — the pre-existing `server/lib/*.ts` typecheck errors (`ChildProcessWithoutNullStreams` missing `.on`) predate this work and are untouched by it.

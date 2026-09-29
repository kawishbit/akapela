# 01: No two Tracks share a Song

**What to build:** An app-wide rule: a Song confirmed on one Track can't be confirmed on another.

Two Songs are the same when their artist and title are identical after trimming outside whitespace. Nothing else is normalised: case, accents, a "feat." in the artist, and a " - Remastered 2011" in the title all make a different Song.

The check lives in `saveSong` (`server/lib/tracks.ts`), in the same transaction as the write, so two requests confirming the same Song at once can't both succeed. Don't use a unique index: libraries that already have duplicates would fail the migration. Existing duplicates stay as they are, and the rule applies to every confirmation from now on. Changing a Track's Song to the Song it already has is not a conflict.

Export the lookup (`trackWithSong(akapela, song)` or similar) so the Playlist Import preview (ticket 04) and creation (ticket 06) use the same comparison.

On the Track page, confirming a Song another Track already has is refused with a new error code, `songInLibrary`, with the other Track's id and title as parameters. The page shows "Already in your Library: <title>" and links to that Track. Nothing about the Track being edited changes.

**Blocked by:** None

**Status:** done

- [x] Confirming a Song that another Track has is refused with `songInLibrary`, and neither Track changes
- [x] Differences in case, artist string, or title suffix are different Songs and are allowed
- [x] Outside whitespace is trimmed before comparing (and before storing)
- [x] Re-confirming a Track's own Song succeeds
- [x] Two concurrent confirmations of the same Song on two Tracks: exactly one succeeds
- [x] A database with existing duplicates upgrades and runs. The duplicates are untouched and can still be edited.
- [x] The Track page shows the refusal with a link to the other Track
- [x] `songInLibrary` is in `shared/error-codes.ts`, `en.json`, and `id.json`
- [x] `CONTEXT.md`'s **Song** entry already states the rule. Check it still matches what shipped.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Implemented (2026-09-29).** `songInLibrary` carries only `title` as its parameter, because every parameter of a code has to appear in its message (`tests/unit/i18n-keys.test.ts`). The other Track's id is sent beside the code, as `track: { id, title }` in the refusal's data. A Track re-confirming the Song it already has never clashes, even with a duplicate from before the rule. `CONTEXT.md`'s Song entry matches what shipped.

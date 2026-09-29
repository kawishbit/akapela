# 01: Backing Source is Original or Stems, with Stem Levels

**What to build:** The domain and storage change everything else builds on.

`shared/backing-source.ts` becomes `original | stems`. Add a `StemLevels` shape, `{ guideVocal: number, instrumental: number }`, each a number from 0 to 1, with a parser and a default of `{ guideVocal: 0, instrumental: 1 }`. Refuse anything outside 0–1 with a message that says the range.

Parsing is backward compatible: `instrumental`, wherever it appears (stored rows, request bodies, the `?source=` query on `backing.get.ts`), reads as `stems`. `NO_STEMS_MESSAGE` and its error code now cover `stems`.

Storage (a Drizzle migration under `server/db/migrations`):
- **Track**: the Backing Source column's `instrumental` rows become `stems`. Add the Stem Levels columns, defaulting to 0 and 1.
- **Take** and **Mix**: the same. Existing rows become `stems` at 0/100.

The Track's levels are set through the Backing Source route (`server/api/tracks/[id]/backing-source.put.ts`), which takes an optional `stemLevels` next to `backingSource`. Setting levels while the Backing Source is Original is allowed: they are remembered for later. `TakeUploadMeta`, `TakeReviewUpdate`, and the Mix request (`shared/mix.ts`) each carry `stemLevels`. Track detail returns them.

Keep the levels in both of these cases: when the Stems are deleted (`server/lib/tracks.ts:654` resets only the Backing Source) and when a Separation succeeds again. A successful Separation still switches the Track to `stems`.

The two Stem files keep their current basenames. `BACKING_SOURCE_BASENAMES` changes to however the render (02) and the stream route need to name the Vocals and Instrumental Stems separately. The stream route takes `?source=original|stems&stem=vocals|instrumental`, or a separate route per Stem, whichever reads better. Ticket 03 is its consumer.

**Blocked by:** None

**Status:** done

- [x] `parseBackingSource('instrumental')` returns `stems`. Unknown values are still refused.
- [x] Stem Levels parse from 0 to 1 inclusive, and anything else is refused
- [x] The migration moves every `instrumental` Track, Take, and Mix to `stems` at 0/100 and leaves `original` rows alone
- [x] A Track's Stem Levels can be set by the API, persist, and come back on Track detail
- [x] Setting `stems` on an unseparated Track is refused as `instrumental` was
- [x] Deleting Stems resets the Backing Source to Original and keeps the levels
- [x] Re-separating keeps the levels, and success switches the Backing Source to Stems
- [x] Take upload, Review save, and Mix request carry and validate `stemLevels`
- [x] Each Stem can be streamed on its own, with range support
- [x] `tests/unit/backing-source.test.ts`, `tests/api/backing-source.test.ts`, `takes.test.ts`, and `mixes.test.ts` cover the above
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

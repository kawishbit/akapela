# 05: The Jobs page

**What to build:** `/jobs`: one place that answers what is running, what is next, and what went wrong.

Three sections:

- **Running** — at most two, one per Lane.
- **Queued** — in the order each will run, with a small label saying whether it waits behind Separations or behind everything else. The word "Lane" never appears in the UI.
- **Finished** — newest first, with **Clear finished** above it.

A row carries the Track's cover and title, what the Job is doing (**Importing**, **Separating**, **Mixing**), its state, its progress, and its actions. A Mix row names its Take underneath — "Take 2, 14:03" — because a Track can have several Takes queued for mixing at once and the rows are otherwise identical. A failed row shows its error message. `noop` Jobs are shown like any other; no type is filtered out, so a type added later cannot silently vanish from the page.

Actions per row: **Cancel** on queued and running, **Retry** on failed. They call ticket 02's routes. Rows are keyed by Job id and actions live on the row, so a future "cancel all queued Separations" for playlist import drops in rather than forcing a selection model now.

The page polls `GET /api/jobs` about once a second while anything is queued or running and stops when everything is idle — the pattern `useLibrary` already uses while importing. No SSE.

Empty state: "Nothing running. Imports, Separations, and Mixes show up here.", with a link back to the Library.

English strings, in the style of the rest of the app; localisation is `ROADMAP.md` item 6.

**Blocked by:** 02

**Status:** done

- [x] `/jobs` lists every Job in the three sections, with Track title and cover, what it is doing, state, and progress
- [x] A Separation shows a percentage; other types show their own progress honestly
- [x] A Mix row identifies its Take
- [x] Cancel appears on queued and running rows, Retry on failed ones, and each does what ticket 02 defined
- [x] Clear finished removes what ticket 02 says it removes, and leaves an unretried failure in place
- [x] Polling runs only while something is active and stops when the page goes idle or unmounts
- [x] The empty state appears when there are no Jobs at all
- [x] Works at phone width with no horizontal scroll; keyboard reachable actions; both themes
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

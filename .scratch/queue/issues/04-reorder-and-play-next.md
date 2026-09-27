# 04: Reorder, Play next, rename

**What to build:** The three ways an entry changes without leaving the Queue.

- **Drag to reorder**, working with touch as well as a mouse — a party runs on phones. A keyboard alternative (move up / move down on the focused row) so reordering isn't mouse-only.
- **Play next**: move an entry to the top, one action, on every row but the first.
- **Rename**: edit an entry's singer name in place, for the typo or the person who arrived.

Server side: `POST /api/queue/:id/move` with the target index, `POST /api/queue/:id/play-next`, and `PATCH /api/queue/:id` for the name. A move rewrites the affected rows' `position` in one transaction so the order is never half-applied. Two devices moving at once is last-write-wins; the poll corrects the loser's view within a few seconds, and the drag must not fight an incoming poll mid-gesture.

**Blocked by:** 02

**Status:** done

- [x] An entry can be dragged to a new place with touch and with a mouse, and the order persists across a reload
- [x] The same move is possible from the keyboard
- [x] Play next moves an entry to the top and is absent on the first row
- [x] A name can be changed in place, and cleared back to no name
- [x] Positions stay a contiguous order with no duplicates after a hundred random moves
- [x] A poll arriving mid-drag does not snap the row out from under the finger
- [x] Two devices moving different entries at once leaves a sane order, not a corrupt one
- [x] Tests cover the position rewriting, including moving the first to last and back
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

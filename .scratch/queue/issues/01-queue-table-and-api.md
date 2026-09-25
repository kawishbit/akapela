# 01: The Queue table and its API

**What to build:** The Queue as data, with no UI on top of it yet.

A `queue_entries` table: `id`, `trackId` (references `tracks`, `onDelete: 'cascade'`, like every other child row), `singerName` (nullable free text), `position` (integer), `createdAt`. One Queue per install, so there is no queue id — the table *is* the Queue. The same Track may appear any number of times.

Routes:

- `GET /api/queue` — entries in `position` order, each with what a row needs to render: the Track's title, artist, cover, and its Separation state and progress (ticket 07 renders it; return it from the start so the page needs no second request per entry).
- `POST /api/queue` — `{ trackId, singerName? }`, appended at the end. Returns the created entry.
- `DELETE /api/queue/:id` — remove one entry.
- `POST /api/queue/clear` — remove every entry.

The domain functions live in `server/lib/queue.ts`, the way `tracks.ts` and `jobs.ts` own theirs; routes stay thin. `position` is assigned as "last + 1" inside the same transaction as the insert, so two devices adding at once cannot collide.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] A migration adds `queue_entries`; an existing database upgrades cleanly
- [ ] `POST /api/queue` appends, returns the entry, and accepts a missing or empty name as no name
- [ ] Two concurrent adds produce two entries with different positions
- [ ] `GET /api/queue` returns entries in order with the Track fields a row needs, in one query
- [ ] The same Track can be queued several times, and each entry is independent
- [ ] Deleting a Track removes its entries
- [ ] `DELETE /api/queue/:id` on an entry that is already gone is a clean 404 or no-op, not a 500
- [ ] A restored backup brings its Queue with it (no special handling; just confirm nothing breaks)
- [ ] Tests cover appending, ordering, the cascade, and clear
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

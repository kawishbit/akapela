# 02: The Queue page

**What to build:** `/queue`: the list of who sings next, on every device in the house.

Entries in order, each row carrying the Track's cover, title, artist, and the singer's name when there is one. The first row is visibly the one that's up. Per row: **Remove**. Above the list: the count, and **Clear** behind a confirm.

The page polls `GET /api/queue` about every 3 seconds while it is open, stopping when it unmounts — a `useQueue` composable in the shape of `useLibrary`, since ticket 06 and the header count need the same data. An add or a remove from another phone appears within a poll.

A header link to `/queue` with the entry count, beside the Jobs link (`ROADMAP.md` item 1, ticket 06) in both the Library header and `TitleBar.vue`. Unlike the Jobs badge, the count shows whenever the Queue is non-empty — it is the thing people want to glance at.

Empty state: "Nobody's up yet. Add a song from your Library.", linking to the Library.

The home screen is not touched.

**Blocked by:** 01

**Status:** done

- [x] `/queue` lists entries in order, with cover, title, artist, and singer name where set
- [x] Remove takes an entry out; Clear empties the Queue behind a confirm
- [x] The list updates within a few seconds when another device adds or removes
- [x] Polling stops when the page unmounts; nothing polls from a screen that isn't showing the Queue
- [x] A header link with the count exists in the Library header and in `TitleBar`
- [x] The empty state shows when there are no entries
- [x] The Library home screen is unchanged
- [x] Works at phone width with no horizontal scroll; keyboard reachable; both themes
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

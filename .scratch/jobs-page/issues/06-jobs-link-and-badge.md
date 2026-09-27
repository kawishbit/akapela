# 06: Jobs link, its badge, and the Library card's chip

**What to build:** A way to reach the Jobs page from anywhere, and a way back to a Job from the Track it belongs to.

The Library header and `TitleBar.vue` link only to Settings today. Add a **Jobs** link beside it, in both, carrying a badge with the number of queued and running Jobs. The badge is what makes a forty-song playlist import visible from a screen that is not the Jobs page; it is hidden when the count is zero, so nothing new appears on an idle install.

The count comes from the same polling the Jobs page uses — one composable, shared, polling only while something is active — not a second timer per component.

A Library card that is importing or separating already shows a progress chip. The chip becomes a link to `/jobs#<jobId>`, which highlights that row on arrival. The rest of the card still opens the Track.

**Blocked by:** 05

**Status:** done

- [x] Jobs is reachable from the Library header and from `TitleBar` in the Desktop App
- [x] The badge counts queued and running Jobs and disappears at zero
- [x] One shared poll feeds both the badge and the page; no duplicated timers, nothing polling while idle
- [x] A Library card's progress chip opens `/jobs` scrolled to its own row, highlighted
- [x] Clicking elsewhere on the card still opens the Track
- [x] Works at phone width and in the Desktop App's title bar; both themes; keyboard reachable
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

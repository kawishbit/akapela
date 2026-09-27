# 04: Up next after a plain Sing visit

**Status:** needs-triage

**What happens:** `app/pages/tracks/[id]/sing.vue` calls `turn.end()` on every visit to the Sing screen, not only one opened from the Queue with `?entry=`. So someone practising a song on their own, with a Queue that isn't empty, is offered **Up next** on Review or on the Track page when they finish.

**The question:** is a plain visit "a turn"? `.scratch/queue/issues/06-up-next.md` says "When a turn ends and the Queue isn't empty, whoever is next is offered". A party that forgets to go through the Queue still gets pointed back at it, which may be what you want. Someone rehearsing alone may find it noise.

**If the answer is "only Queue turns":** in `sing.vue`, call `turn.end()` only when `turn.entry.value` was ever set (`useQueueTurn` already remembers it once seen). That's a one-line change, plus a note in `CONTEXT.md`'s **Up next** entry.

## Comments

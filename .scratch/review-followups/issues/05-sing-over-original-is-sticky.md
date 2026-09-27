# 05: Sing over the original changes the Track for good

**Status:** needs-triage

**What happens:** **Sing over the original** in `app/components/SingChoiceDialog.vue` does `PUT /api/tracks/:id/backing-source` with `original` before opening the Sing screen. That is the Track's remembered Backing Source, so it stays `original` after the turn. A first Separation flips it to `instrumental` when it succeeds, so that case heals itself. But on a Track being *re*-separated, whose previous Stems were fine, the singer who chose "original" for one turn has switched that Track back to the original audio for everyone until someone switches it again.

**Why it was done that way:** it was the smallest honest way to make the Sing screen play the original audio, and the Take then records what was actually sung over.

**A way to fix it:** make the Backing Source a per-visit choice on the Sing screen. A `?backing=original` query that `sing.vue` hands to the player overrides the Track's remembered source for that visit only. `backingTrackPath` in `server/lib/tracks.ts` already takes an override for exactly this kind of audition.

## Comments

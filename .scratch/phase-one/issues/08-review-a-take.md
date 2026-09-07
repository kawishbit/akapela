# 08: Review a Take

**What to build:** After stopping a recording, or from the Takes list, a singer lands on a review screen that plays the Take over the Backing Track through the same audio engine used for singing. A latency nudge slider in milliseconds shifts the vocal and is audible immediately; its value is remembered per device as the default for the next Take. Vocal gain and backing gain sliders set the balance. The Backing Track pitch can still be changed, while tempo is shown locked to the Take's value with an explanation. The singer can keep the Take with its review settings or discard it.

**Blocked by:** 07 (Record a Take)

**Status:** done

- [x] The review screen loads the Take WAV and the Backing Track and plays them together through the Rubber Band engine with the Take's Adjustments applied to the backing
- [x] The nudge slider offsets the vocal in milliseconds during playback with no restart, with a sensible default
- [x] The nudge value is stored in browser storage as the per-device default and pre-filled on the next Take
- [x] Vocal gain and backing gain are separate gain stages, audible live
- [x] Pitch can be changed on the review screen and is saved to the Take; tempo is displayed but locked, with a short note that the vocal was sung to it
- [x] Keep saves nudge, gains, and pitch to the Take; discard deletes the Take and its file after one confirmation
- [x] API tests cover updating a Take's review parameters and rejecting a tempo change
- [x] Alignment by ear with the nudge slider is verified manually on a laptop and a phone

## Comments

Implemented. Every checklist item is done except the last: alignment by ear
needs a human actually listening on real hardware, which isn't something an
agent in this environment can judge. The Review screen (`/tracks/:id/takes/:takeId`)
plays the Take's dry vocal over the Backing Track on one shared AudioContext
(ADR 0006), seeked to the Take's start position; nudge, vocal gain, and
backing gain apply live with no restart, and pitch is adjustable while tempo
is shown locked and rejected server-side if a client tries to change it
(ADR 0003). Keep flushes a debounced save of the review settings; Discard
reuses the existing delete-Take endpoint behind one confirmation. Landing on
Review happens both from stopping a recording and from tapping a Take in the
Takes list, per the ticket's "What to build."

Automated coverage: `tests/api/takes.test.ts` (review update, tempo rejection,
audio streaming) and `tests/unit/format.test.ts` (the two new formatters)
pass, alongside the full existing suite. `pnpm typecheck` and `pnpm lint` are
clean.

**2026-09-07, maintainer.** Alignment by ear with the nudge slider was checked on a laptop and a phone, closing the last box. The ticket is `done` at 8/8.

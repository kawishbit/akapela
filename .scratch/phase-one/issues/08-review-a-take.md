# 08: Review a Take

**What to build:** After stopping a recording, or from the Takes list, a singer lands on a review screen that plays the Take over the Backing Track through the same audio engine used for singing. A latency nudge slider in milliseconds shifts the vocal and is audible immediately; its value is remembered per device as the default for the next Take. Vocal gain and backing gain sliders set the balance. The Backing Track pitch can still be changed, while tempo is shown locked to the Take's value with an explanation. The singer can keep the Take with its review settings or discard it.

**Blocked by:** 07 (Record a Take)

**Status:** ready-for-agent

- [ ] The review screen loads the Take WAV and the Backing Track and plays them together through the Rubber Band engine with the Take's Adjustments applied to the backing
- [ ] The nudge slider offsets the vocal in milliseconds during playback with no restart, with a sensible default
- [ ] The nudge value is stored in browser storage as the per-device default and pre-filled on the next Take
- [ ] Vocal gain and backing gain are separate gain stages, audible live
- [ ] Pitch can be changed on the review screen and is saved to the Take; tempo is displayed but locked, with a short note that the vocal was sung to it
- [ ] Keep saves nudge, gains, and pitch to the Take; discard deletes the Take and its file after one confirmation
- [ ] API tests cover updating a Take's review parameters and rejecting a tempo change
- [ ] Alignment by ear with the nudge slider is verified manually on a laptop and a phone

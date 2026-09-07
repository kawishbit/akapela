# 06: Effects live in the browser engine

**What to build:** Reverb and the low-pass, audible immediately while the song keeps playing, exactly as pitch and tempo already are. The Effects hang off the existing Rubber Band worklet's output: a `ConvolverNode` with dry and wet gain stages, then a `BiquadFilterNode` lowpass, then the existing output gain. Chain order is pitch and tempo, then reverb, then low-pass — the same order the worker will use in ticket 07, because ADR 0003 makes the two implementations each other's contract.

Adjusting either is a parameter change on a live graph, never a reload. And both bypass entirely at their defaults, so a Track nobody has touched runs through the same straight wire it ran through in phase one.

One impulse response, bundled in `public/audio/` and shared by both engines. ADR 0003 requires the same IR on both sides; shipping several would mean matching several.

**Blocked by:** 05 (Effects on Adjustments)

**Status:** ready-for-agent

- [ ] A single large-hall impulse response is bundled in `public/audio/` and loaded once alongside the worklet
- [ ] The engine graph is worklet → convolver with dry/wet gains → biquad lowpass → output gain, with a comment naming ticket 07 as the side that must match it
- [ ] Changing either Effect while playing is audible immediately with no dropout and no restart
- [ ] Both Effects are bypassed — nodes disconnected, not merely set to neutral — at reverb 0 and low-pass 20000, so an untouched Track's signal path is unchanged from phase one
- [ ] `AdjustmentsPanel.vue` grows an Effects section, collapsed by default, holding a reverb amount slider and a log-scaled low-pass cutoff slider showing Hz, per DESIGN.md's collapsing strategy
- [ ] Effects persist with the rest of the Track's Adjustments and are restored when the Track is opened again
- [ ] The review engine applies Effects to the backing only, leaving the Take's vocal dry, so review playback matches what ticket 07 renders

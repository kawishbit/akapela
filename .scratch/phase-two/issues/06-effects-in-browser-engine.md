# 06: Effects live in the browser engine

**What to build:** Reverb and the low-pass, audible immediately while the song keeps playing, exactly as pitch and tempo already are. The Effects hang off the existing Rubber Band worklet's output: a `ConvolverNode` with dry and wet gain stages, then a `BiquadFilterNode` lowpass, then the existing output gain. Chain order is pitch and tempo, then reverb, then low-pass — the same order the worker will use in ticket 07, because ADR 0003 makes the two implementations each other's contract.

Adjusting either is a parameter change on a live graph, never a reload. And both bypass entirely at their defaults, so a Track nobody has touched runs through the same straight wire it ran through in phase one.

One impulse response, bundled in `public/audio/` and shared by both engines. ADR 0003 requires the same IR on both sides; shipping several would mean matching several.

**Blocked by:** 05 (Effects on Adjustments)

**Status:** done

- [x] A single large-hall impulse response is bundled in `public/audio/` and loaded once alongside the worklet
- [x] The engine graph is worklet → convolver with dry/wet gains → biquad lowpass → output gain, with a comment naming ticket 07 as the side that must match it
- [x] Changing either Effect while playing is audible immediately with no dropout and no restart
- [x] Both Effects are bypassed — nodes disconnected, not merely set to neutral — at reverb 0 and low-pass 20000, so an untouched Track's signal path is unchanged from phase one
- [x] `AdjustmentsPanel.vue` grows an Effects section, collapsed by default, holding a reverb amount slider and a log-scaled low-pass cutoff slider showing Hz, per DESIGN.md's collapsing strategy
- [x] Effects persist with the rest of the Track's Adjustments and are restored when the Track is opened again
- [x] The review engine applies Effects to the backing only, leaving the Take's vocal dry, so review playback matches what ticket 07 renders

## Comments

The impulse response (`public/audio/large-hall-ir.wav`) is synthesized rather than a field recording: exponentially decaying stereo noise, seeded deterministically, ~600 KB. It is the standard approximation of a large hall's diffuse tail and is what ticket 07 must load too (ADR 0003's "one impulse response" requirement).

Manually verifying this against a real Track surfaced a pre-existing gap, not introduced here: `parseAdjustments`'s tolerant defaulting (ticket 05) was only wired into the Adjustments PUT endpoint, never into the `tracks`/`takes` read path. A Track or Take row written before this pair of fields existed — `$type<Adjustments>()` only asserts the shape at compile time — came back from the DB with `reverbAmount`/`lowpassHz` genuinely `undefined`, which the new engine code turned into a live crash (`Failed to set the 'value' property on 'AudioParam': The provided float value is non-finite`) the moment such a Track was opened. Fixed at the read boundary in `server/lib/tracks.ts` (`getTrack`, `listTracks`) and `server/lib/takes.ts` (`getTake`, `listTakes`), each now running the row's `adjustments` through `parseAdjustments` before handing it out, with regression tests in `tests/api/adjustments.test.ts` and `tests/api/takes.test.ts` that write a raw phase-one blob directly via `sqlite.prepare` (bypassing the app) to prove it. This is what ticket 05's "tolerance at the parse boundary is the whole migration" actually requires — reads included, not just the one write path that existed when it was cut.

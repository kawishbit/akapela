# 05: Effects on Adjustments: shared shape, tolerant parse

**What to build:** The parameter shape both engines will consume, settled before either engine is touched — this is the one place a mistake would be expensive on both sides at once. `Adjustments` gains `reverbAmount` (0–100, a dry/wet crossfade) and `lowpassHz` (200–20000, where 20000 means bypassed). Two integers, one knob each, per the spec's argument against resonance and multiple impulse responses.

The part to get right is backward compatibility. `parseAdjustments` currently rejects anything missing a field, and every `takes` and `mixes` row written in phase one holds a three-field JSON blob. A strict parse would break every Take already recorded. **The parse must default the two new fields rather than throw.** No stored JSON is rewritten; tolerance at the parse boundary is the whole migration.

**Blocked by:** nothing

**Status:** done

- [x] `shared/adjustments.ts` gains `reverbAmount` and `lowpassHz` with their bounds, defaults, and a doc comment saying both bypass at their default values
- [x] `parseAdjustments` accepts a phase-one three-field object and returns it with both Effects defaulted; the doc comment says why, naming the phase-one rows
- [x] `parseAdjustments` still rejects out-of-bounds and non-integer Effect values, with the message naming the valid ranges
- [x] `DEFAULT_ADJUSTMENTS` is a no-op for both Effects: reverb 0, low-pass 20000
- [x] The `tracks.adjustments` column's default and the API's Adjustments update path both carry the new fields
- [x] Vitest covers the new fields at their bounds, off their bounds, non-integer, and the phase-one-shaped input defaulting cleanly

## Comments

Widening `Adjustments` to five required fields also touched two call sites that construct it directly: `shared/mix.ts`'s `toMixRequest` (via a widened `MixRequestSource`) and `app/composables/useTakeReview.ts`'s `currentAdjustments`. Both now carry `reverbAmount`/`lowpassHz` straight through from their source (a Take, or Review screen state loaded from one) rather than hardcoding the bypass default, so a Review-screen save can never reset Effects a later ticket starts writing. Neither gets a control for them yet — that is ticket 06 (browser engine) and 08 (pill row). A Mix row still has no `reverb_amount`/`lowpass_hz` columns of its own; that is ticket 07.

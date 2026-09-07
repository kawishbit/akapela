# 05: Effects on Adjustments: shared shape, tolerant parse

**What to build:** The parameter shape both engines will consume, settled before either engine is touched — this is the one place a mistake would be expensive on both sides at once. `Adjustments` gains `reverbAmount` (0–100, a dry/wet crossfade) and `lowpassHz` (200–20000, where 20000 means bypassed). Two integers, one knob each, per the spec's argument against resonance and multiple impulse responses.

The part to get right is backward compatibility. `parseAdjustments` currently rejects anything missing a field, and every `takes` and `mixes` row written in phase one holds a three-field JSON blob. A strict parse would break every Take already recorded. **The parse must default the two new fields rather than throw.** No stored JSON is rewritten; tolerance at the parse boundary is the whole migration.

**Blocked by:** nothing

**Status:** ready-for-agent

- [ ] `shared/adjustments.ts` gains `reverbAmount` and `lowpassHz` with their bounds, defaults, and a doc comment saying both bypass at their default values
- [ ] `parseAdjustments` accepts a phase-one three-field object and returns it with both Effects defaulted; the doc comment says why, naming the phase-one rows
- [ ] `parseAdjustments` still rejects out-of-bounds and non-integer Effect values, with the message naming the valid ranges
- [ ] `DEFAULT_ADJUSTMENTS` is a no-op for both Effects: reverb 0, low-pass 20000
- [ ] The `tracks.adjustments` column's default and the API's Adjustments update path both carry the new fields
- [ ] Vitest covers the new fields at their bounds, off their bounds, non-integer, and the phase-one-shaped input defaulting cleanly

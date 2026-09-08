# 12: Replace the latency nudge slider with a typed numeric input

**What to build:** The Review screen's Latency nudge control (`app/pages/tracks/[id]/takes/[takeId].vue`) is a `<input type="range">` clamped to ±500ms (`LATENCY_NUDGE_MS_MIN`/`MAX` in `shared/take.ts`). A device's real round-trip latency — Bluetooth headphones, a TV or soundbar, a browser under load — can exceed that, and a slider's travel doesn't scale cleanly to whatever the true ceiling should be anyway. Replace it with a control the singer types an exact millisecond value into, and widen the validated bounds so a genuinely high-latency device isn't clipped.

Both `parseTakeReviewUpdate` (`shared/take.ts`) and `parseMixRequest` (`shared/mix.ts`) validate against the same two constants, so widening them is a one-place change; no DB migration is needed since `latency_nudge_ms` is a plain, unconstrained integer column on both `takes` and `mixes`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `LATENCY_NUDGE_MS_MIN`/`MAX` in `shared/take.ts` widened to a generous bound (proposing ±5000ms) instead of ±500ms
- [x] The Review screen's Latency nudge control becomes a numeric input the singer types into (not a range slider), backed by `review.setNudge`, which already clamps to the shared bounds and auditions live via `engine.setNudge` with no restart of the Backing Track
- [x] A value typed outside the bounds is clamped the same way `setNudge` already clamps slider input, with feedback that the value was adjusted rather than a silent no-op
- [x] `formatLatencyNudge` (`app/utils/format.ts`) still reads correctly at the new bounds
- [x] `INVALID_TAKE_REVIEW_MESSAGE` and `INVALID_MIX_REQUEST_MESSAGE` name the new bounds
- [x] Unit and API tests (`tests/api/takes.test.ts` and friends) updated for the new range

Out of scope: any change to how the nudge is applied — the existing `startPositionMs + nudgeMs` placement math in `TakeReviewEngine` and `render.py` is unaffected, only how the value is entered and how far it can go.

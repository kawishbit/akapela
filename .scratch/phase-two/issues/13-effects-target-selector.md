# 13: Let Effects target the vocal, the Backing Track, both, or neither

**What to build:** Reverb and the low-pass filter (Effects) currently only ever run on the Backing Track, on both the live browser engine (`BackingTrackEngine` in `app/audio/engine.ts`) and the worker's render (`render_mix` in `worker/akapela_worker/audio.py`) — the recorded vocal path is untouched in either. That split is invisible from the Review screen, which reads as "Effects affect everything." Give Effects a target: Vocal, Backing Track, Both, or None, chosen once and applied to Reverb and Low-pass together — the domain treats them as one "Effects" set (`CONTEXT.md`).

This is a Mix-time parameter exactly like Backing Source (ADR 0003 amendment): the recorded vocal stays dry regardless of target, since routing a dry signal through reverb/low-pass at playback or render time doesn't require the vocal to have been recorded any differently. Add an ADR 0003 amendment documenting Effects target alongside the existing Backing Source one.

`reverbAmount`/`lowpassHz` live on `Adjustments` (`shared/adjustments.ts`), stored as a JSON blob on `tracks.adjustments` and `takes.adjustments` — add `effectsTarget` there too, defaulted to `'backing'` for any stored row that predates the field, the same tolerant-parse trick ticket 05 used for `reverbAmount`/`lowpassHz` themselves. `mixes`, unlike `takes`, flattens Adjustments into individual columns (`reverb_amount`, `lowpass_hz`) — this needs an actual migration adding an `effects_target` column there, mirroring ticket 07.

On the browser side, `BackingTrackEngine`'s reverb/low-pass chain (`applyReverb`/`applyLowpass` in `app/audio/engine.ts`) only ever patches into the Backing Track's own worklet-to-destination graph. Applying Effects to the vocal means `TakeReviewEngine` (`app/audio/review-engine.ts`) needs an equivalent small chain (convolver + biquad, same impulse response, same bypass-when-unconnected discipline) on the dry vocal's own path to `vocalGainNode`, enabled or disabled by target. On the worker side, `render_mix`'s `vocal_chain` (currently just `adelay`/`atrim` + `volume`) gains the same `afir`/`lowpass` segments the `backing_segments` chain already has, gated by target.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `Adjustments` gains `effectsTarget: 'vocal' | 'backing' | 'both' | 'none'`, defaulting to `'backing'` (today's only behavior) for any stored row missing the field
- [x] `mixes` gains an `effects_target` column (migration + schema + `parseMixRequest`/`toMixRequest`), matching the pattern ticket 07 already set for `reverb_amount`/`lowpass_hz`
- [x] The Review screen exposes a single Effects-target picker (Vocal / Backing / Both / None) governing both Reverb and Low-pass together
- [x] `TakeReviewEngine` routes the dry vocal through the same convolver+lowpass treatment as the Backing Track when the target includes `'vocal'`, using the identical impulse response and the same bypass-when-inactive graph discipline `BackingTrackEngine` already follows
- [x] `render_mix`'s vocal chain gains the same `afir`/`lowpass` segments as the backing chain, gated by `effects_target`, so a rendered Mix matches what the Review screen played
- [x] With target `'backing'` (the default), behavior is byte-for-byte what it is today — this ticket must not regress the existing path
- [x] Worker tests cover all four targets: reverb/low-pass measurably present on vocal-only, backing-only, both, and neither
- [x] ADR 0003 gains an amendment for Effects target, alongside the existing Backing Source one

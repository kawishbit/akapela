# 07: Effects in the Mix render

**What to build:** The server side of the same two Effects, so a rendered Mix sounds like the rehearsal (ADR 0003). `render_mix`'s single `filter_complex` extends rather than splits: the backing chain becomes `rubberband` → `afir` → `lowpass` before the existing `amix` with the vocal. The vocal input is untouched — Effects are a Backing Track property and the recorded voice stays dry, which is what makes a Take re-renderable with a different reverb forever.

Both filters are omitted from the chain entirely at their defaults, not merely configured to be neutral, so a Mix rendered from an untouched Track is what phase one would have produced.

The matching detail worth guarding: a Web Audio `BiquadFilterNode` lowpass at default Q is two-pole and ffmpeg's `lowpass` default is two-pole, so the engines agree without tuning. Do not add poles or resonance on either side.

**Blocked by:** 05 (Effects on Adjustments), 06 (Effects live in the browser engine)

**Status:** ready-for-agent

- [ ] `mixes` gains `reverb_amount` and `lowpass_hz`, copied onto the row at request time like every other render parameter
- [ ] The Mix request accepts both Effects alongside the pitch it already accepts; tempo stays locked to the Take
- [ ] `render_mix` applies reverb with `afir` against the same bundled impulse response ticket 06 loads, then the low-pass, then mixes the dry vocal in
- [ ] Both filters are absent from the chain at their default values, and a render with defaults matches the no-Effects path
- [ ] Worker tests assert reverb raises energy in the tail after the last input sample, the low-pass measurably reduces high-frequency energy, and defaults produce output matching the pre-Effects render — real ffmpeg on short generated audio
- [ ] The Review screen exposes both Effects as Mix-time parameters, changeable after recording the way pitch already is (ADR 0003)

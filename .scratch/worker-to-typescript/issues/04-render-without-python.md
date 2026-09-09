# 04: Rendering a Mix works without Python

**What to build:** From the outside, rendering a Mix — a Take's dry vocal combined with its Backing Track under the Take's Adjustments — sounds identical to today: tempo and pitch via Rubber Band, reverb and low-pass applied to whichever side the Effects Target names, MP3 output for sharing. Internally, `render_mix`'s ffmpeg filter graph is ported to a TS wrapper calling a real ffmpeg binary via a spawned subprocess, running inside the in-process runner from ticket 02.

**Blocked by:** 02 (in-process job runner)

**Status:** done

- [x] A Mix rendered from the TS path is audibly and measurably equivalent to the current Python path across at least: no Effects, reverb only, low-pass only, both Effects on the vocal, both on the backing, both on both
- [x] A Mix always covers exactly the Take's target duration, matching today's padding/trimming behavior
- [x] A negative `vocal_wall_ms` (an early Take) is still handled by trimming, not delaying
- [x] The render Job is run by the in-process TS runner, not the Python worker
- [x] Existing render tests are ported and pass against the new implementation

## Result

`renderMix` in `server/lib/audio.ts` ports `render_mix`'s filter_complex
graph string-for-string (same `rubberband`/`afir`/`lowpass`/`amix` shape,
reverb built before low-pass, either skipped entirely at bypassed values).
27 tests in `tests/unit/jobs/render.test.ts` port `test_render.py`, including
its real-audio RMS-window assertions (a hand-rolled WAV RMS reader in
`tests/unit/wav-rms.ts`, no `wave` module equivalent needed) for every
Effects Target combination, tempo/pitch placement, gain, and the
byte-identical-output check for bypassed-vs-explicit defaults.

Verified end-to-end on a live dev server: upload → take → a real rendered
Mix (MP3 + WAV) with reverb audibly present, no Python process running.

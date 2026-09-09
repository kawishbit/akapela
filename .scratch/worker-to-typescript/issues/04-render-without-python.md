# 04: Rendering a Mix works without Python

**What to build:** From the outside, rendering a Mix — a Take's dry vocal combined with its Backing Track under the Take's Adjustments — sounds identical to today: tempo and pitch via Rubber Band, reverb and low-pass applied to whichever side the Effects Target names, MP3 output for sharing. Internally, `render_mix`'s ffmpeg filter graph is ported to a TS wrapper calling a real ffmpeg binary via a spawned subprocess, running inside the in-process runner from ticket 02.

**Blocked by:** 02 (in-process job runner)

**Status:** ready-for-agent

- [ ] A Mix rendered from the TS path is audibly and measurably equivalent to the current Python path across at least: no Effects, reverb only, low-pass only, both Effects on the vocal, both on the backing, both on both
- [ ] A Mix always covers exactly the Take's target duration, matching today's padding/trimming behavior
- [ ] A negative `vocal_wall_ms` (an early Take) is still handled by trimming, not delaying
- [ ] The render Job is run by the in-process TS runner, not the Python worker
- [ ] Existing render tests are ported and pass against the new implementation

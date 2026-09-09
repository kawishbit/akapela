# 06: Vocal removal (Separation) works without Python

**What to build:** From the outside, asking a Track to have its vocals removed behaves as it does today: a Vocals Stem and an Instrumental Stem appear, selectable as the Backing Source, without the Python worker touching this Job type. Internally, the validated pipeline from ticket 05 is wired into a Job handler hosted by the in-process runner from ticket 02.

**Blocked by:** 02 (in-process job runner), 05 (validated TS separation path)

**Status:** ready-for-agent

- [ ] Asking for Separation on a Track produces both Stems, normalized to 44.1kHz stereo WAV (ADR 0005) as today
- [ ] Re-separating an already-separated Track (asking again) behaves as it does today
- [ ] A first-time separation on a machine with no cached model downloads it into the cache path from ticket 01, and a network failure during that download surfaces as today's Job error, retried by hand
- [ ] The separate Job is run by the in-process TS runner, not the Python worker
- [ ] Existing separation tests are ported and pass against the new implementation

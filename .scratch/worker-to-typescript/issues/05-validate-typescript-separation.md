# 05: Validate a TypeScript vocal-separation path against the current one

**What to build:** A standalone, repeatable check — not wired into any Job yet — that a TypeScript vocal-separation pipeline (`onnxruntime-node` running the same MDX-Net ONNX model, with a hand-rolled STFT/windowing/chunking/overlap-add pipeline standing in for what `audio-separator` currently does in torch around the model call) produces an Instrumental Stem equivalent to today's output on a fixed test clip. This is the ticket that says "the port is sound" before ticket 06 depends on it.

**Blocked by:** 01 (data directory split — the model weights this fetches belong in the new cache path)

**Status:** ready-for-agent

- [ ] A script or test feeds the same audio clip through both the current Python/torch path and the new TS path
- [ ] The two Instrumental Stems are compared by an objective measure (e.g. spectral difference or a standard separation-quality metric) against a documented threshold, not by ear alone
- [ ] The model weights are fetched into the cache path from ticket 01
- [ ] The comparison and its result are recorded in this ticket so a later reader doesn't have to re-run it to know whether the port is trustworthy

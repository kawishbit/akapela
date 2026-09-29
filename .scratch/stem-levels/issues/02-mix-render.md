# 02: The Mix blends the Stems before the stretch

**What to build:** `renderMix` (`server/lib/jobs/render.ts`) renders a Mix whose Backing Source is `stems` from both Stems at the Mix's Stem Levels.

Blend first, then stretch once. ffmpeg sums the Vocals and Instrumental Stems with a `volume` on each (no normalisation, so 100/100 is the plain sum), and writes the blend to a temporary file. That file goes to the stretch subprocess (`server/lib/stretch/stretch-cli.ts`) exactly as a single Backing Track does today, and the rest of the graph (Effects, backing gain, placement, encoding) is unchanged. This matches the browser (ticket 03), which blends before the Rubber Band worklet.

Shortcuts, so the common cases cost what they do now:
- Guide Vocal 0: use the Instrumental Stem alone, scaled by its level. At 0/100 this is exactly today's `instrumental` render.
- Instrumental 0: use the Vocals Stem alone.
- Both 0: a silent Backing Track of the original's duration. The render must not fail.

The duration used for placement comes from the Stems' headers as it does today. A Mix against Stems that are no longer on disk still fails with its existing message, naming whichever Stem is missing.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A Mix at 0/100 renders the same as a pre-change `instrumental` Mix (compare in `tests/unit/jobs/render.test.ts`)
- [ ] A Mix at 50/100 contains the Vocals Stem at half level (for example, check the Vocals Stem's energy is present using fixture tones)
- [ ] Both at 0 renders, with a silent backing and the vocal present
- [ ] Adjusted tempo or pitch stretches the blend once, not each Stem
- [ ] A missing Stem fails the Job with a clear message and code
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

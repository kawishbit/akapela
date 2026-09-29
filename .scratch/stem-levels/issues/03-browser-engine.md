# 03: The browser engine blends the Stems before Rubber Band

**What to build:** `app/audio/engine.ts` plays a Backing Source of `stems` by decoding both Stems and summing them at their Stem Levels **before** the Rubber Band worklet (`backing-track-processor`). There is still one stretch.

- Load: fetch and decode the Instrumental Stem, and the Vocals Stem only if Guide Vocal > 0. If the Guide Vocal is later raised from 0, fetch the Vocals Stem then, without interrupting playback. It stays silent until it has loaded.
- Blend: the worklet (or a stage just before it) takes two sample buffers and two gains and sums them. `setStemLevels(levels)` changes the gains live, with no reload, pause, or seek. The change is heard after the stretcher's buffer, which is expected.
- Switching between Original and Stems is still a reload, as switching Backing Source is today.
- `setGain` (backing gain / listening volume) still applies after the blend.
- The Review engine (`app/audio/review-engine.ts`) convolves the vocal chain against the engine's buffer (see the comment near `engine.ts:70`). Make sure it still has what it needs when the backing is a blend.

`usePlayer` exposes the current Stem Levels in its state and a `setStemLevels` action. The action remembers them on the Track through the ticket 01 API, debounced like the other pending saves. `useTakeRecorder` snapshots them when recording starts, next to `recordedBackingSource` (`useTakeRecorder.ts:163`), and sends them in the Take's meta.

Memory: two decoded Stems double the Backing Track's memory. Skipping the Vocals Stem at 0% keeps the default case as it is. Note the cost in a comment. Nothing more is required.

**Blocked by:** 01

**Status:** done

- [x] At 0/100, only the Instrumental Stem is fetched, and playback matches today's
- [x] Raising the Guide Vocal fetches the Vocals Stem once and blends it in without a pause
- [x] Moving a level never reloads, seeks, or restarts the worklet
- [x] Tempo and pitch still apply to the blend, stretched once
- [x] A Take's meta carries the Stem Levels from the moment recording started, even if they were moved during it
- [x] Unit tests for the blending logic and the fetch-on-demand rule, in the style of the existing engine tests
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

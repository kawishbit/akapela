# 01: Mix render stretches with Rubber Band WebAssembly

**What to build:** Rendering a Mix with pitch and tempo Adjustments works with any stock ffmpeg, including one with no librubberband, on every platform. The render Job stretches the Backing Track with the same Rubber Band WebAssembly build, using the same options, that live playback already uses. ffmpeg receives already-stretched audio for Effects and mixing. The Mix a singer downloads matches the preview they sang over.

Today ffmpeg's `rubberband` filter is part of every Mix's filter graph, even with no Adjustments. An ffmpeg without that filter fails every render outright. That filter is the only reason any bundled ffmpeg needs librubberband (see the spec).

The stretch is CPU-heavy and runs inside the app process's Job runner. Run on the main thread, it would stall every API request while a Mix renders. It has to run off the main thread, the way Separation already keeps its heavy work out of the server's way.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A Mix with non-default pitch and tempo renders correctly through an ffmpeg with no `rubberband` filter, and its length and vocal placement match what a native-filter render produced (the existing render tests' assertions still hold)
- [x] A Mix with default Adjustments still renders, and no longer depends on the `rubberband` filter at all
- [x] The render stretch uses the same Rubber Band build and options as the browser engine, so linked and independent pitch/tempo behave the same in the preview and the export
- [x] The server keeps answering requests while a long Mix renders (the stretch runs off the main thread)
- [x] The CI `checks` job no longer requires its ffmpeg to have the `rubberband` filter
- [x] ADR 0003 and ADR 0004 are amended to record that the final render's stretch now runs on Rubber Band WebAssembly rather than ffmpeg's filter, and why

## Comments

**Done.** The render's stretch moved out of ffmpeg:

- `server/lib/stretch/rubberband.ts` loads `rubberband-wasm`'s `rubberband.wasm` the way `public/audio/rubberband-processor.js` does and stretches a whole signal with the worklet's option flags. It adds the start pad and drops the start delay, as the worklet does on every seek. `tests/unit/stretch/rubberband.test.ts` parses the worklet's flags and checks that they equal `RUBBER_BAND_OPTIONS`.
- `server/lib/stretch/stretch-cli.ts` is spawned by `renderMix` as its own `node` subprocess, like `separate-cli.ts`. It writes a 32-bit float WAV, so a pitch shift that overshoots full scale is not clipped before ffmpeg mixes it.
- `buildMixFilterGraph` no longer contains a `rubberband` segment. The Backing Track input feeds straight into the Effects. At tempo 100% and no pitch shift the stretch is skipped.
- The wasm and the CLI are found through `server/lib/tools.ts` (`AKAPELA_RUBBERBAND_WASM`, `AKAPELA_STRETCH_CLI`). The Dockerfile copies both to the default paths. `desktop/scripts/prepack.ts` compiles the CLI into `staging/stretch/` with the wasm beside it, and the shell sets both overrides.

Tests:
- The existing render tests still pass.
- New render tests check that +5 semitones lands at the shifted frequency with the length unchanged, that linked 150% raises the pitch 1.5× and shortens the Mix to ⅔, and that a slower, pitch-shifted Mix still places the vocal in wall time.
- A `monitorEventLoopDelay` test renders a 60 s adjusted Backing Track and holds the loop's worst stall under 250 ms.
- The compiled CLI (`tsc` with prepack's flags) and the TypeScript CLI under `node:24-bookworm-slim` both ran against a real WAV.

Not verified: a full `docker build`. It fails at `pnpm install` in the build stage (better-sqlite3's `node-gyp rebuild`), before any line this ticket touched. I checked the new `COPY` of the wasm through pnpm's symlinked `node_modules` path separately.

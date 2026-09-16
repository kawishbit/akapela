# Live Adjustments run in the browser, the final Mix is rendered on the server

Pitch, tempo, and reverb are applied in real time in the browser with Web Audio so the user can tweak while the Backing Track plays. The Mix is rendered server-side with ffmpeg and Rubber Band from the same parameters. This means two implementations of the same effect chain that must sound alike. Reverb uses the same bundled impulse response on both sides to keep them matched. The trade-off was accepted because instant live tweaking is the core experience the Android karaoke apps got wrong, and server rendering keeps export quality consistent regardless of the client device.

## Consequences

- Adjustments must be expressed as plain parameters that both engines can consume.
- A Take records its Adjustments so the server can reproduce what the singer heard.
- Tempo is locked to the Take's value at Mix time; pitch and effects may still be changed afterwards because the recorded vocal does not depend on them.

## Amendment (phase two): Backing Source is a Mix-time parameter too

Once a Track can have Stems, *which audio* the Backing Track is becomes a parameter, and it belongs on the same side of the line as pitch and the Effects rather than with tempo. A Take records the Backing Source it was sung to, and a Mix may override it, because the recorded vocal does not depend on that choice either.

- Sing over the original recording with the real singer audible to stay on pitch, then render the Mix against the Instrumental Stem so only your voice is on it.
- A Take recorded before its Track had Stems is re-renderable against an instrumental separated later. Nothing already sung goes stale.
- A Mix carries its own Backing Source, so it reproduces what was requested regardless of what the Track has been switched to since. Rendering against Stems that have since been deleted fails with a message rather than quietly using the original.

## Amendment (phase two): the Effects have a Target

Reverb and the low-pass started out on the Backing Track and nowhere else, on both engines, which made "Effects" read as though they coloured everything you heard. They now carry a target — Vocal, Backing Track, Both, or None — chosen once for the pair, since the domain treats them as one set (`CONTEXT.md`).

It sits on the same side of the line as pitch and Backing Source, for the same reason: a dry signal can be sent through reverb and a low-pass at playback or at render time, so nothing about it has to have been recorded differently.

- The recorded vocal is stored dry whatever the Target says. Singing with reverb on your own voice is decided at review and at render, never a property of the Take.
- The browser gives the vocal its own chain — the same convolver and biquad, against the same impulse response — and the worker's render gives it the same `afir` and `lowpass` segments. Either side is left out of its graph entirely when the target does not reach it, so nothing is coloured by a filter merely set to be neutral.
- `backing` is the default, and the value every Take, Track, and Mix written before the target existed parses as, so nothing already recorded or rendered changes meaning.

## Amendment: the render stretches with the preview's own Rubber Band build

The Mix render used to stretch the Backing Track with ffmpeg's `rubberband` filter. It now runs Rubber Band WebAssembly, the same `rubberband-wasm` build the browser engine loads for live playback, with the same options (real-time mode, no threads, high-consistency pitch, channels together). ffmpeg gets audio that is already stretched and does only the Effects, placement, mixing, and encoding.

Two things forced this, and a third made it worth doing:

- **No publisher ships a static Apple Silicon ffmpeg with librubberband.** The filter was in every Mix's graph, even with no Adjustments, so an ffmpeg without it failed every render. Building one from source for macOS broke on toolchain quirks and would have been a Mac-only build to maintain forever (`.scratch/apple-silicon-release/`).
- **The filter was the only reason any bundled ffmpeg needed librubberband.** Moving the stretch lets every platform bundle a stock, checksum-pinned ffmpeg.
- **The export now matches the preview more closely.** "Two implementations that must sound alike" is now one implementation for the stretch: the same wasm and the same option flags on both sides. The Effects are still two implementations sharing one impulse response.

Consequences:

- **The stretch runs in its own subprocess.** `server/lib/stretch/stretch-cli.ts` is spawned by `renderMix` the way the separate Job spawns its CLI. Rubber Band over a whole song takes seconds to minutes of CPU, and the Job runner shares its process with every API request.
- **Unadjusted Mixes skip the stretch.** At tempo 100% and no pitch shift the Backing Track goes to ffmpeg unchanged. The old filter still ran over it, and the preview still does.
- **Real-time mode, not offline mode.** Offline mode with a study pass would be the better choice for quality alone. It is not what the preview runs, and matching the preview is the point. `tests/unit/stretch/rubberband.test.ts` checks that the worklet's option flags and the render's are identical, because the worklet cannot import the module.
- **The wasm is found the same way as every other tool** (`rubberBandWasmPath()` in `server/lib/tools.ts`). By default it is `node_modules/rubberband-wasm/dist/rubberband.wasm` under the app root, which the compose image copies in. The desktop shell stages its own copy and sets `AKAPELA_RUBBERBAND_WASM`.

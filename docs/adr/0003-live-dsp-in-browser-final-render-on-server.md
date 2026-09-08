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

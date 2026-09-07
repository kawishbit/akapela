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

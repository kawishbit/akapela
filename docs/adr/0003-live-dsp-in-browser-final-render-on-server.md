# Live Adjustments run in the browser, the final Mix is rendered on the server

Pitch, tempo, and reverb are applied in real time in the browser with Web Audio so the user can tweak while the Backing Track plays. The Mix is rendered server-side with ffmpeg and Rubber Band from the same parameters. This means two implementations of the same effect chain that must sound alike. Reverb uses the same bundled impulse response on both sides to keep them matched. The trade-off was accepted because instant live tweaking is the core experience the Android karaoke apps got wrong, and server rendering keeps export quality consistent regardless of the client device.

## Consequences

- Adjustments must be expressed as plain parameters that both engines can consume.
- A Take records its Adjustments so the server can reproduce what the singer heard.
- Tempo is locked to the Take's value at Mix time; pitch and effects may still be changed afterwards because the recorded vocal does not depend on them.

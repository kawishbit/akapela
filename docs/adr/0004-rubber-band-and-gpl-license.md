# Rubber Band for pitch and tempo, so the project is GPL-3.0

Rubber Band, compiled to WebAssembly for the browser and used via ffmpeg on the server, gives noticeably better quality than SoundTouch on large pitch shifts. Rubber Band is GPL, which makes the whole project GPL-3.0. This was chosen knowingly over SoundTouch (LGPL, would have allowed MIT) because audio quality is the point of the app and it is self-hosted, not a commercial product. Swapping later would mean relicensing, which is hard once there are outside contributions.

## Amendment: Rubber Band WebAssembly on both sides

The server no longer uses Rubber Band through ffmpeg. The Mix render runs the same Rubber Band WebAssembly build as the browser, in a Node subprocess (ADR 0003 amendment). The quality decision stands. It is still Rubber Band, now with the preview's exact build and options. The licence reasoning stands too, since `rubberband-wasm` is Rubber Band compiled to wasm and is GPL like the library.

What changed is where the GPL dependency comes from. It used to arrive twice: once in the npm package and once linked into ffmpeg as librubberband. Now it arrives only through the npm package. No bundled ffmpeg has to carry librubberband, so ADR 0010's reason for choosing BtbN's `gpl` variant no longer holds. Whether a slimmer build would do is a separate question, tracked in `.scratch/apple-silicon-release/issues/05-slimmer-bundled-ffmpeg.md`. The project stays GPL-3.0-only either way.

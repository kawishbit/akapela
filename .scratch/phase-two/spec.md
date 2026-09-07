# Spec: Phase Two — Stems, Effects, and Presets

Status: ready-for-agent

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Boxes | What is left |
| - | ------ | ------ | ----- | ------------ |
| 01 | [Separator interface, separate Job, and Stems on disk](issues/01-separator-and-separate-job.md) | done | 8/8 | Running the real model once, which ticket 10's manual checklist owns |
| 02 | [Separate action, separation state, and Stems in the API](issues/02-separate-action-and-api.md) | done | 7/7 | Watching a real separation run to the end on the Track page, which ticket 10's manual checklist owns |
| 03 | [Backing Source on the Track](issues/03-backing-source.md) | done | 7/7 | Hearing a mid-song switch reload and pick up in time, which ticket 10's manual checklist owns |
| 04 | [Delete Stems and reclaim disk](issues/04-delete-stems.md) | ready-for-agent | 0/5 | Everything |
| 05 | [Effects on Adjustments: shared shape, tolerant parse](issues/05-effects-on-adjustments.md) | ready-for-agent | 0/6 | Everything |
| 06 | [Effects live in the browser engine](issues/06-effects-in-browser-engine.md) | ready-for-agent | 0/7 | Everything |
| 07 | [Effects in the Mix render](issues/07-effects-in-mix-render.md) | ready-for-agent | 0/6 | Everything |
| 08 | [Presets: table, built-ins, API, and the pill row](issues/08-presets.md) | ready-for-agent | 0/8 | Everything |
| 09 | [Take and Mix carry Backing Source; Review override](issues/09-backing-source-on-takes-and-mixes.md) | ready-for-agent | 0/7 | Everything |
| 10 | [Docs, ADRs, and the device pass](issues/10-docs-adrs-device-pass.md) | ready-for-agent | 0/6 | Everything |

## Problem Statement

Phase one delivered the loop: import a song, get Lyrics, adjust pitch and tempo, sing, render a Mix. It works, and it has one hole where the whole premise leaks out. Akapela only ever sings over *the audio you imported*. If YouTube has no karaoke version of the song you want — and for most songs it does not — you are singing over the original recording with the original singer on it, competing with a voice that is louder, better, and in your ears the entire time. The app that was supposed to replace the karaoke-video hunt still requires you to find a karaoke video.

The second hole is smaller and more felt than reasoned. Pitch and tempo are correct, precise, and dry. Nobody sings into a dry room. And the one sound every singer has actually heard of — the slowed-and-reverb edit — is exactly a tempo change plus a reverb plus a low-pass, which is three parameters this app is one parameter short of having. `CONTEXT.md` has carried a **Preset** entry defined as "a named bundle of Adjustments, such as Slowed and Reverb" since before there were any Adjustments worth bundling.

## Solution

Phase two closes both. A Track gets a **Separate** button that runs vocal removal on the server and produces two **Stems**: an Instrumental Stem you sing over, and a Vocals Stem kept for later. The Backing Track then becomes a **choice** rather than a fixed file — the separated instrumental by default, the original audio whenever the separation came out worse than its source. Separation is per Track and on demand, because a Track imported from a karaoke video needs nothing done to it and separation costs minutes of a laptop's CPU.

Adjustments gain two **Effects** — a reverb amount and a low-pass cutoff — applied live in the browser and reproduced in the rendered Mix, in the same two-implementations arrangement ADR 0003 already committed to for pitch and tempo. Both apply to the Backing Track only; what you sing is still recorded dry. Then **Presets** put a whole sound one tap away: Slowed and Reverb, Nightcore, and Practice ship with the app, and you can save your own.

One consequence is worth naming up front because it is better than it sounds. A Take records the Backing Source it was sung to, and a Mix can override it. So you can sing along to the original recording with the real singer audible to keep you on pitch, then render a Mix against the Instrumental Stem with only your voice on it. And a Take recorded in phase one, before Stems existed, can be re-rendered against an instrumental you separate tomorrow. Nothing already sung goes stale.

## User Stories

### Vocal removal and Stems

1. As a singer, I want to press a button on a Track and have Akapela separate it into a Vocals Stem and an Instrumental Stem, so that a song with no karaoke version still gives me one to sing over.
2. As a singer, I want separation to run in the background as a Job like an import, so that I can keep using the app while it works.
3. As a singer, I want the Track to show that it is separating with an elapsed timer rather than a percentage, so that a process whose remaining time genuinely is not known still looks alive.
4. As a singer, I want a failed separation to show its error with a retry button, so that a missing model or a lost network does not leave me guessing.
5. As a singer, I want separation to be something I ask for per Track rather than something every import does, so that a Track that is already an instrumental does not waste minutes of my laptop's CPU.
6. As a singer, I want to re-run separation on a Track that already has Stems, so that a better model later does not mean re-importing.
7. As a singer, I want to delete a Track's Stems without deleting the Track, so that separating my whole library does not fill the disk permanently.

### Choosing what you sing over

8. As a singer, I want the Backing Track to switch to the Instrumental Stem by itself once separation succeeds, so that the common case takes no extra tap.
9. As a singer, I want to switch back to the original audio at any time, so that a separation that came out worse than its source is one tap to undo.
10. As a singer, I want to see which Backing Source is playing on the Sing screen, so that I always know whether I am hearing the separated instrumental or the original.
11. As a singer, I want the original Backing Track to stay untouched on disk when Stems are made, so that switching back is instant and lossless.
12. As a singer, I want the Backing Source remembered per Track, so that opening a Track again gives me what I last sang over.

### Effects

13. As a singer, I want a reverb amount control on the Backing Track, so that a dry recording gets some space around it.
14. As a singer, I want a low-pass filter control on the Backing Track, so that I can take the top off a song the way the slowed-and-reverb edits do.
15. As a singer, I want Effects changes to be audible immediately while the song keeps playing, exactly like pitch and tempo, so that I can find the setting by ear.
16. As a singer, I want the Effects controls in a section collapsed by default, so that they do not crowd the lyrics on a phone.
17. As a singer, I want my Effects remembered per Track along with the rest of the Adjustments, so that I do not set them again next time.
18. As a singer, I want a rendered Mix to reproduce the Effects I heard, so that the export sounds like the rehearsal.
19. As a singer, I want Effects to apply only to the Backing Track and never to my recorded voice, so that a Take stays dry and re-renderable.
20. As a singer, I want a Track with no Effects set to sound exactly as it did before phase two, so that adding the feature costs nothing to anyone who ignores it.

### Presets

21. As a singer, I want a row of Preset pills above the Adjustments controls, so that a whole sound is one tap.
22. As a singer, I want Slowed and Reverb, Nightcore, and Practice to ship with the app, so that the Presets that name this feature are there on day one.
23. As a singer, I want to save my current Adjustments as a named Preset, so that a sound I found once is reusable on other Tracks.
24. As a singer, I want to delete a Preset I made, so that experiments do not accumulate.
25. As a singer, I want the built-in Presets to be undeletable, so that I cannot lose Slowed and Reverb by accident.
26. As a singer, I want a Preset to carry only Adjustments and nothing Track-specific, so that applying one to any Track does what its name says.

### Takes and Mixes once Stems exist

27. As a singer, I want a Take to record which Backing Source it was sung to, so that a Mix reproduces what I heard by default.
28. As a singer, I want to override the Backing Source when I render a Mix, so that I can sing along to the original with the real singer audible and still export a Mix with only my voice on it.
29. As a singer, I want a Take recorded before the Track had Stems to be re-renderable against the Instrumental Stem later, so that nothing I have already sung goes stale.
30. As a singer, I want Effects changeable at Mix time the way pitch already is, so that a bad reverb choice does not mean re-singing.
31. As a singer, I want tempo to stay locked to the Take, so that my vocal never drifts out of time.

### Self-hosting

32. As a self-hoster, I want the separation model downloaded on first use rather than baked into the image, so that the image stays small and I only pay for it if I separate something.
33. As a self-hoster, I want the model cached in the data volume, so that pulling a new image does not re-download it.
34. As a self-hoster, I want separation to run in the same one-at-a-time Job queue as imports and renders, so that my laptop is never running two heavy jobs at once.
35. As a self-hoster, I want the README to say what separation costs in time, disk, and network, so that I know what I am turning on.

## Implementation Decisions

### Vocal removal

- Separation uses `audio-separator` (MIT) running an MDX-Net vocal model on ONNX Runtime. Chosen over Demucs for better instrumentals on this particular job; it was expected to be a far smaller image too, and is not, because `audio-separator` depends on torch regardless. See ADR 0008.
- Every call into it sits behind a `Separator` Protocol in `worker/akapela_worker/separators.py`, mirroring `SourceFetcher` exactly. The model is the fragile third-party thing this phase adds, the way yt-dlp was phase one's, and the interface exists for the same reason.
- Two Stems only: `instrumental.wav` and `vocals.wav`. Four-stem separation is the same model run differently, but it is a mixer UI, four times the disk, and a fourfold widening of what a Preset and a Mix must reproduce. Phase three at the earliest.
- A new Job type, `separate`, targeting a Track id. It runs in the existing one-at-a-time queue with the existing states, the existing no-auto-retry rule, and the existing stale-job recovery.
- Files land in the Track directory next to the untouched `backing.wav`, at 44.1 kHz stereo WAV like everything else (ADR 0005). `backing.wav` is never overwritten, so switching back to the original is instant and lossless.
- Re-separation is allowed and overwrites both files in place. It is the escape hatch when a better model lands.
- The model is downloaded by the first separation Job into `<dataDir>/models/`, not at startup and not into the image. A self-hoster who never separates anything never pays for it, and the cache survives `docker compose pull` because it lives on the data volume. A failed download becomes the Job's error on the Track, handled by the same retry button phase one built for a broken yt-dlp.
- No new AppHost prerequisite check. The model is not a binary on PATH and it is fetchable on demand, so the ffmpeg/ffprobe/node health pattern does not apply to it.
- A Track deleted mid-separation is handled the way phase one's import job handles a Track deleted mid-import: the worker notices, cleans up the orphaned files, and fails the Job rather than resurrecting the row.

### Progress

- The Job writes coarse steps to its row as usual: 10 started, 30 model ready, 85 Stems written, 100 done.
- The UI renders separation as an **elapsed timer**, not a percentage. This is the one place phase two departs from phase one's progress convention, and it is deliberate: a bar sitting at 10 percent for four minutes reads as broken rather than working, and the remaining time genuinely is not knowable.

### Effects

- Two Effects, each with exactly one knob: **reverb amount** (0–100, a dry/wet crossfade into one bundled impulse response, a large hall) and **low-pass cutoff** (200 Hz to 20 kHz on a log slider, where 20 kHz means bypassed).
- One impulse response, bundled and shared by both engines, as ADR 0003 requires. Several IRs would mean shipping and matching several files for a variation nobody asked for.
- No resonance control on the low-pass. A Web Audio `BiquadFilterNode` lowpass at default Q is two-pole and ffmpeg's `lowpass` default is two-pole, so the two engines agree without tuning. That agreement is an accident worth preserving by not adding the knob.
- Effects apply to the Backing Track only. The recorded vocal stays dry, so a Take is never spoiled by an effect choice and a Mix can always be re-rendered with a different one. Vocal Effects are phase three and will need their own parameter object on the Take.
- Chain order in both engines: pitch and tempo, then reverb, then low-pass.
- Both Effects bypass entirely at their defaults, so an untouched Track's graph is a straight wire and its Mix is what phase one would have produced.

### Schema

- `tracks` gains `separation_state` (`none`, `separating`, `ready`, `failed`) and `backing_source` (`original`, `instrumental`, default `original`). `separation_state` mirrors `import_state`: the Job carries the mechanics, the Track carries what the card renders.
- `takes` gains `backing_source`, defaulting to `original` so every phase-one Take keeps meaning what it meant.
- `mixes` gains `backing_source`, `reverb_amount`, and `lowpass_hz`, copied onto the row at request time like every other render parameter.
- A new `presets` table: id, name, the five Adjustments fields, a `built_in` flag, timestamps. The three built-ins are seeded by the migration with `built_in = 1`; deleting one is rejected.
- `Adjustments` gains `reverbAmount` and `lowpassHz`. **`parseAdjustments` must default the two new fields rather than throw**, because every existing `takes` and `mixes` row holds a three-field JSON blob and a strict parse would break every Take recorded in phase one. Stored JSON is not rewritten; tolerance at the parse boundary is the whole migration.

### HTTP API (app)

- `POST /api/tracks/:id/separate` enqueues a separate Job. `POST /api/tracks/:id/separate/retry` re-enqueues a failed one, the shape import retry already uses.
- `DELETE /api/tracks/:id/stems` removes both files and returns `backing_source` to `original`.
- `PUT /api/tracks/:id/backing-source` switches it, rejecting `instrumental` on a Track with no Stems.
- The Backing Track stream route resolves which file to serve from the Track's `backing_source`, with an explicit `?source=` override so the Review screen can audition the other one.
- `GET`, `POST`, `DELETE /api/presets`. Delete rejects built-ins.
- The Mix request accepts `backingSource`, `reverbAmount`, and `lowpassHz` alongside the pitch it already accepts. Tempo stays locked to the Take.

### Browser audio engine

- Effects hang off the existing Rubber Band worklet's output: a `ConvolverNode` with dry and wet gain stages, then a `BiquadFilterNode` lowpass, then the existing output gain. Adjusting either is a parameter change on a live graph, never a reload, so Effects behave exactly as pitch and tempo do today.
- Switching Backing Source fetches and decodes the other file and resumes at the same song position. It is a reload, unlike every other Adjustment, and the UI should not pretend otherwise.
- Only one Backing Track is decoded at a time. Summing the Vocals Stem back in as a guide vocal would roughly double the ~85 MB a four-minute song occupies decoded, which is not a cost to smuggle into a phone-first app. Phase three.

### Worker render

- `render_mix`'s single `filter_complex` extends rather than splits: the backing chain becomes `rubberband` → `afir` → `lowpass` before the existing `amix` with the vocal. Both Effect filters are omitted from the chain entirely when at their defaults.
- The backing input file is chosen from the Mix's own `backing_source`, so a Mix reproduces the source it was requested with regardless of what the Track has been switched to since.

### UI

- `AdjustmentsPanel.vue` grows a row of Preset pills above the existing controls, kept expanded because a Preset replaces five adjustments in one tap and is the fastest control in the panel, plus an **Effects** section collapsed by default holding the two sliders. Saving is a "Save current as…" affordance at the end of the pill row.
- Track detail grows the Separate button, the separation state, and Delete Stems.
- The Sing screen shows the Backing Source alongside the pitch and tempo readout already there.
- The Review screen grows a Backing Source override next to the pitch control it already has, with the same visible-lock treatment tempo gets.

## Testing Decisions

The three seams from phase one, unchanged. A good test still exercises behaviour observable from outside a module, and still uses the glossary vocabulary.

1. **App HTTP API.** Separate request enqueues a Job and moves the Track to `separating`; retry re-enqueues a failed one. Stems delete removes both files and resets Backing Source. Backing Source switching persists, and `instrumental` is rejected on a Track with no Stems. Preset create, list, delete, and the built-in delete rejection. Mix request carrying Backing Source and both Effects. Adjustments validation for the two new fields at their bounds. And explicitly: **a phase-one three-field Adjustments blob still parses**, with the Effects defaulted.
2. **Worker job runner.** The `separate` job with a fake `Separator` writing fixture files: both Stems present, durations matching the Backing Track, the Track row moving to `ready` with `backing_source` flipped to `instrumental`, the error recorded on failure, the model-download failure message, and a Track deleted mid-separation leaving no orphaned files. The real model never runs in the suite — it is a network fetch and minutes of CPU — exactly as real yt-dlp never runs. Render with Effects runs ffmpeg for real: reverb raises energy in the tail after the last input sample, the low-pass measurably reduces high-frequency energy, defaults produce output matching the no-Effects path, and `backing_source` selects the right input file.
3. **Pure client modules.** `parseAdjustments` with the new fields, their bounds, and phase-one-shaped input. Applying a Preset to Adjustments.

Nothing asserts separation *quality*. It is not testable and it is not ours. Real-model verification, the live Effects by ear, and the grown panel on a phone go on ticket 10's manual checklist, alongside phase one's outstanding device items.

## Out of Scope

- The guide vocal fader — summing the Vocals Stem back in at a gain so you can hear the original singer while learning. Deliberately deferred: a second decoded stream roughly doubles the ~85 MB a four-minute song occupies in the browser, on the phones this app is meant to work on. The Vocals Stem is written and kept so phase three needs no re-run.
- Four-stem separation and any stem mixer.
- Effects on the recorded vocal, and the Vocal Effects parameter object that would carry them.
- Any Effect beyond reverb and low-pass: EQ, compression, delay, chorus, distortion. Each is a genuine two-engine matching problem.
- More than one impulse response.
- Automatic separation on import.
- GPU acceleration for separation.
- Presets carrying Backing Source, Lyrics Offset, or gains.
- Everything phase one put out of scope and phase two does not name here.

## Further Notes

- `audio-separator` and its models are MIT, so ADR 0004's GPL-3.0 compatibility constraint holds.
- The Vocals Stem is written and kept although nothing plays it in phase two. The run that made it is minutes of pegged CPU and disk is cheap; discarding it to save 40 MB would trade the expensive resource for the cheap one.
- Backing Source being a Mix-time parameter is the reason a Take never goes stale, and it is an extension of ADR 0003 rather than a new decision. Ticket 10 amends that ADR rather than adding one.
- `Reset` stays the button story 41 of phase one gave it. Making it a Preset would put a row in the list that behaves unlike every other row.
- Lower-the-key and raise-the-key are not Presets. The pitch stepper already does both in one tap; a Preset would only add a name.

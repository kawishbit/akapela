# Akapela

A self-hosted karaoke app. Import a song from YouTube or a file, get an instrumental with synced lyrics, adjust pitch and tempo, sing, and walk away with a mixed recording.

## Language

### Library

**Source**:
Where a Track's audio originally came from. Kinds: YouTube, Upload.
_Avoid_: Input, link, video

**Track**:
An entry in the library, created by importing one Source. Owns the original audio and everything derived from it.
_Avoid_: Song (reserved for the musical work identity), item, file

**Song**:
The musical work a Track represents: an artist and a title. Used to look up Lyrics. A Track has at most one confirmed Song.
_Avoid_: Metadata, match

**Backing Track**:
The audio you sing over. Whichever of the Track's audio files the Backing Source names.
_Avoid_: Instrumental (ambiguous with the Stem), beat, minus-one

**Backing Source**:
Which audio a Track's Backing Track is taken from: its original audio, or its Instrumental Stem. Remembered per Track, and recorded on a Take so a Mix can reproduce — or deliberately depart from — what was sung to.
_Avoid_: Backing mode, stem toggle

**Stems**:
The outputs of vocal removal on a Track: a Vocals Stem and an Instrumental Stem. A Track has them only if vocal removal has been asked for; both are kept, and the original audio is never replaced by them.
_Avoid_: Separated audio, layers

**Separation**:
Running vocal removal on one Track: the Job that makes its Stems, and the state the Track carries while it runs, after it fails, and once it has finished. Asked for per Track rather than done on every import, since it costs minutes of CPU and a Track imported from a karaoke video needs none of it.
_Avoid_: Splitting, extraction, isolation

### Lyrics

**Lyrics**:
Text attached to a Track. Either Synced, with a timestamp per line, or Plain, with no timing.
_Avoid_: Subtitles, captions

**Lyrics Provider**:
Where Lyrics were fetched from. One of LRCLIB, Genius, Manual.
_Avoid_: Lyrics source, API

**Lyrics Offset**:
A per-Track time shift applied to Synced Lyrics so they line up with a Backing Track whose intro differs from the studio version.
_Avoid_: Delay, sync correction

### Performance

**Adjustments**:
The playback settings applied to a Backing Track: pitch in semitones, tempo as a percentage, whether pitch and tempo are linked, the Effects, and the Effects Target. Pitch and tempo only ever reach the Backing Track. What you sing is recorded dry, so Adjustments shape what you sing over, never what you sang.
_Avoid_: Settings, filters, FX chain

**Effects**:
The part of Adjustments that colours a sound rather than its pitch or speed: a reverb and a low-pass filter. One set, always chosen together. Applied live in the browser and again when a Mix is rendered (ADR 0003).
_Avoid_: FX, processing, filters (a filter is one Effect, not the set)

**Effects Target**:
Which side of a Mix the Effects colour: the Vocal, the Backing Track, Both, or None. A Mix-time parameter like Backing Source — the recording itself is always dry, and the reverb is added on the way out (ADR 0003 amendment).
_Avoid_: Routing, send, bus, wet channel

**Preset**:
A named bundle of Adjustments, such as Slowed and Reverb.
_Avoid_: Mode, profile

**Take**:
One recorded attempt at singing a Track. Stores the dry vocal recording, the latency compensation, and the Adjustments in force at the time.
_Avoid_: Recording, session, attempt

**Mix**:
The rendered file combining a Take's vocal with its Backing Track under the Take's Adjustments.
_Avoid_: Export, render, output, bounce

**Monitoring**:
Hearing your own voice in headphones while recording a Take.
_Avoid_: Playback, feedback, loopback

### Background work

**Job**:
A unit of long-running work the app runs itself, such as an import or producing a Mix. Moves through queued, running, and then succeeded or failed. Jobs run one at a time, in the order they were created.
_Avoid_: Task, process, operation

### Development

**Desktop App**:
The packaged Akapela you download and open on one machine; the same app compose serves, in a window of its own.
_Avoid_: Electron app, native app, client

**AppHost**:
The Aspire program in `apphost/` that starts the app for local development, hands it its configuration, and reports it to the Dashboard. Development only: it is not part of what a self-hoster deploys (ADR 0007).
_Avoid_: Orchestrator, launcher, dev server

**Dashboard**:
The Aspire web UI the AppHost opens, listing each running resource with its health, endpoint, pooled logs, and traces.
_Avoid_: Console, admin, control panel

**Trace**:
One request followed through everything it caused: the API route that served it, and any Job it enqueued. Carried from the request to the Job as the `traceparent` stored on the Job. Development only, like the AppHost that collects it (ADR 0007).
_Avoid_: Log, span tree, transaction

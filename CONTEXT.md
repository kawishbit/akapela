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
The audio you sing over. Either the Track's original audio, or its Instrumental Stem once Stems exist.
_Avoid_: Instrumental (ambiguous with the Stem), beat, minus-one

**Stems**:
The outputs of vocal removal on a Track: a Vocals Stem and an Instrumental Stem.
_Avoid_: Separated audio, layers

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
The playback settings applied to a Backing Track: pitch in semitones, tempo as a percentage, whether pitch and tempo are linked, and effects such as reverb.
_Avoid_: Settings, filters, FX chain

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
A unit of long-running work handed from the app to the Worker, such as an import or producing a Mix. Moves through queued, running, and then succeeded or failed.
_Avoid_: Task, process, operation

**Worker**:
The separate process that runs Jobs one at a time, in the order they were created.
_Avoid_: Queue, daemon, service

### Development

**AppHost**:
The Aspire program in `apphost/` that starts the app and the Worker together for local development, hands them their configuration, and reports them to the Dashboard. Development only: it is not part of what a self-hoster deploys (ADR 0007).
_Avoid_: Orchestrator, launcher, dev server

**Dashboard**:
The Aspire web UI the AppHost opens, listing each running resource with its health, endpoint, and pooled logs.
_Avoid_: Console, admin, control panel

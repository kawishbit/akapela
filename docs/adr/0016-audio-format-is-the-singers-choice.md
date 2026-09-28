# The Audio Format is the singer's choice

_Supersedes ADR 0005. See `ROADMAP.md`, item 1, and `.scratch/faster-separation/`._

ADR 0005 stored every Backing Track master and Stem as 44.1 kHz stereo WAV, because bandwidth on a laptop or LAN costs nothing and one format removes a transcode step and a class of alignment bugs. The disk is what that ignored. Each Track is three large WAVs (the master and two Stems), about 40 MB each for a four-minute song, and a Playlist Import multiplies that by dozens. So the format is now a setting, the **Audio Format**: WAV, FLAC, or MP3. WAV stays the default.

## Decision

- The Audio Format covers the Backing Track master and the Stems. It does not cover Takes, which stay raw PCM (ADR 0006), Mixes, which stay WAV with an MP3 320 export, or the original audio, which is kept as it was delivered.
- MP3 is always 320 kbps CBR, with no separate bitrate setting.
- A change applies only to files written after it. Existing files keep the format they were written in, so a library can be in several formats at once, and each file is read by its own format. Converting an existing library is not part of this decision (`ROADMAP.md`, Later).
- Durations are still read from the files' own headers, never from ffprobe: WAV's `fmt`/`data` chunks, FLAC's `STREAMINFO`, and MP3's Xing/LAME frame.

## Considered Options

- **WAV and FLAC only.** FLAC is lossless and about half the size of WAV, so it answers the size problem with no trade-off. It was the safer choice. MP3 is offered as well because it's what the singer asked for and it's a real choice for them to make.
- **Opus instead of MP3.** Smaller files and cleaner gapless handling, but less familiar to singers. Rejected for familiarity.

## Consequences

- **MP3 padding is the alignment bug ADR 0005 avoided, brought back on purpose.** Every MP3 encode adds priming samples at the start. A decoder that ignores the LAME gapless header plays everything a few tens of milliseconds late: the Backing Track against a Take, the Stems against each other, and the Lyrics against the Backing Track. A test decodes a stored MP3 master and Stem the way the browser and the render pipeline do, and checks the timing against the WAV it came from. MP3 isn't offered until that test passes.
- MP3 loses quality at every step. A Separation reads a decoded MP3 master, its Stems are encoded again, and a Mix renders from those. The 320 kbps setting keeps each loss as small as MP3 allows, and the Settings page calls MP3 lossy.
- The browser decodes FLAC and MP3 natively, so the Backing Track is still fetched and decoded whole for live processing (ADR 0003). It's just a smaller file.

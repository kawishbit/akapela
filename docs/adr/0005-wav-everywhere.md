# WAV for every stored and served audio file

_Superseded by ADR 0016: the Audio Format is now the singer's choice. What follows is the original decision._

Backing Track masters, Stems, Takes, and the server-side render pipeline all use 44.1 kHz stereo WAV. Original Source audio is kept as delivered. The browser fetches the WAV Backing Track and decodes it for live processing, about 40 MB per song. This was chosen over FLAC or Opus delivery because the app runs on a laptop or LAN where bandwidth costs nothing, and one format removes a transcode step and a class of alignment bugs. Mixes are additionally exported as MP3 320 for sharing. Revisit only if playback over cellular ever matters.

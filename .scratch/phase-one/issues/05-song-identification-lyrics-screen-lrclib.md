# 05: Song identification and Lyrics screen via LRCLIB

**What to build:** After a Track imports, Akapela guesses the artist and title from the YouTube title or file name, searches LRCLIB, and shows the top matches. The singer confirms one with a tap or edits the artist and title by hand, and can change the Song later. Lyrics are fetched from LRCLIB, Synced when available and Plain otherwise. The Sing page shows them Spotify-style: current line bright and bold and vertically centred, neighbours dimmed, tap a Synced line to seek, Plain lines auto-scroll proportionally with a pause when the singer scrolls by hand. A Lyrics Offset control in tenths of a second corrects for a karaoke version's different intro and is saved per Track.

**Blocked by:** 04 (Backing Track playback with live Adjustments)

**Status:** ready-for-human

- [x] The Track stores a confirmed Song (artist, title, provider ids, album art URL) as nullable embedded fields, and a Lyrics row stores provider, kind (synced or plain), and lines as JSON with text and optional millisecond timestamps
- [x] A pure title parser strips bracketed segments and standalone noise words (Karaoke, Instrumental, Lyrics, Official, HD and similar), splits on the first dash or pipe, and proposes artist and title in both orders; covered by Vitest
- [x] A Lyrics Provider interface exposes search Songs and fetch Lyrics; the LRCLIB implementation is the first provider and is faked in API tests
- [x] The Track detail page shows the top Song matches, lets the singer confirm one, edit artist and title by hand, and change the confirmed Song later
- [x] Confirming a Song fetches Lyrics from LRCLIB and shows a clear message when none are found
- [x] The Sing page shows the Lyrics full screen with the current line bright and bold and centred, other lines dimmed, on a dark surface where the cover art is the only colour source
- [x] A pure current-line function takes song position, lines, and Lyrics Offset and returns the current line index; covered by Vitest for Synced and Plain, with and without offset
- [x] Tapping a Synced line seeks the Backing Track there
- [x] Plain Lyrics auto-scroll in proportion to song position; manual scrolling pauses auto-scroll for a few seconds
- [x] Lyrics Offset is editable in tenths of a second from the Sing page and persisted on the Track; refetching Lyrics does not reset it
- [x] Lyrics timing follows tempo automatically because position is reported in song time
- [x] API tests cover Song search, confirmation, hand edits, Lyrics fetch, and Lyrics Offset persistence
- [x] The Sing page is readable at arm's length on a phone and across a desk on a laptop, with no jank while lines advance

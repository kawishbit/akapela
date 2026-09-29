# Spec: Spotify playlist import

Status: ready-for-agent

`ROADMAP.md`, item 1. Capitalised terms (Playlist Import, Track, Song, Source, Job, Lane, Separation, Lyrics) are defined in `CONTEXT.md`.

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [No two Tracks share a Song](issues/01-one-track-per-song.md) | ready-for-agent | — |
| 02 | [`PlaylistReader` and the Spotify embed reader](issues/02-playlist-reader.md) | ready-for-agent | — |
| 03 | [The playlist Lane](issues/03-playlist-lane.md) | ready-for-agent | — |
| 04 | [The preview route](issues/04-preview-route.md) | ready-for-agent | 01, 02 |
| 05 | [The checklist page](issues/05-checklist-page.md) | ready-for-agent | 04 |
| 06 | [Starting a Playlist Import](issues/06-starting-an-import.md) | ready-for-agent | 03, 04 |
| 07 | [No YouTube match](issues/07-no-match.md) | ready-for-agent | 06 |
| 08 | [Following it on the Jobs page](issues/08-jobs-page-grouping.md) | ready-for-agent | 06 |
| 09 | [ROADMAP and docs](issues/09-roadmap-and-docs.md) | ready-for-agent | 06 |

01, 02, and 03 can land in any order. 04 then leads to the page (05) and the import itself (06). 07 and 08 build on 06. Everything is on one branch, `feature/spotify-import`.

## Problem Statement

Getting an evening's worth of songs into Akapela today means finding each one on YouTube, pasting its link, confirming its Song, and asking for its Separation, one Track at a time. Singers already have that list, as a Spotify playlist or album.

## Solution

Paste a Spotify playlist or album link. Akapela lists its songs as a checklist, with every song ticked except those it already has, and says how many songs it will import and roughly how long their Separations will take. On **Start**, each ticked song becomes a Track with its Song confirmed from Spotify. Its own import Job finds it on YouTube, downloads it, fetches its Lyrics, and queues its Separation. The whole Playlist Import can be followed and cancelled as one row on the Jobs page.

## Decisions

- **Reading Spotify: the public embed page, no login** (route (a) in the ROADMAP). `open.spotify.com/embed/{playlist|album}/<id>` carries the songs as JSON in `__NEXT_DATA__` (`props.pageProps.state.data.entity`). The name is `entity.name`. For each song in `trackList`, the Spotify id is in `uri`, the title in `title`, the artists (one comma-joined string) in `subtitle`, and the duration in ms in `duration`. It is unofficial and can break without warning, which is why it sits behind `PlaylistReader`, the way `SourceFetcher` wraps yt-dlp.
- **Spike findings (September 2026).** The embed page lists **at most 100 songs** and gives no total. The regular page `open.spotify.com/playlist/<id>` gives the total as `<meta name="music:song_count" content="150">`. The access token embedded in the page got a 429 from the Web API when asked for songs 101 onward, so no cheap way past 100 was found. Songs in the embed page carry no album art of their own.
- **At most 100 songs.** A playlist or album over 100 is refused whole, with nothing imported: "This playlist has 150 songs. Akapela imports up to 100. Make a shorter copy in Spotify and paste that link." If the total can't be read and the embed lists exactly 100 songs, the playlist counts as possibly over 100 and is refused too. This replaces the ROADMAP's earlier "no cap" decision.
- **Albums too.** A Spotify album link works the same way and is also a Playlist Import (see `CONTEXT.md`).
- **No two Tracks share a Song, anywhere in the app** (ticket 01). Two Songs are the same when their artist and title are exactly the same after trimming outside whitespace. Case counts, the full artist string counts, and "Don't Stop Me Now - Remastered 2011" is a different Song from "Don't Stop Me Now". Libraries that already contain duplicates keep them. The rule applies from now on, and the upgrade neither fails nor merges anything.
- **Already in the Library, or already in this list.** In the checklist, a song whose Song another Track already has is greyed out as "In your Library". A song whose Song appears earlier in the same playlist is greyed out as "Already in this list". Neither can be ticked.
- **The Song is confirmed when the Track is created**, from Spotify's artist and title, before any YouTube match. It is reserved from that moment, so two Playlist Imports of the same playlist started back to back cannot both create it.
- **Matching happens inside each song's import Job**, not in the checklist. The checklist opens after one request to Spotify, not a hundred YouTube searches. The Job searches YouTube for "artist - title" (`ytsearch` through `SourceFetcher`) and takes the first result within ±10 s of Spotify's duration, preferring "Topic" and audio-only uploads over music videos. It then downloads as any YouTube import does.
- **No match is an ordinary failed import** with its own error code. Its retry asks for a YouTube link to import from instead of searching again (ticket 07).
- **Everything happens without asking.** After the download, Lyrics are fetched from the Track's Lyrics Provider using Spotify's duration, and a Separation is queued with the default Separation Model. This is the one import where the singer has clearly asked for everything.
- **Lyrics lookup strips edition suffixes; the Song does not.** When searching the Lyrics Provider, a trailing ` - Remastered [year]`, ` - Remaster`, `(Radio Edit)`, ` - Single Version`, ` - Mono`, ` - Stereo`, or ` - [year] Mix` is dropped from the title. The stored Song stays exactly what Spotify said.
- **A third Lane** (ADR 0012 amendment). A Playlist Import's imports run on a **playlist Lane**. A Mix, or a single import started by hand, never waits behind a hundred downloads, and "one at a time per Lane, in creation order" still holds. Separations stay on the heavy Lane.
- **The Jobs remember their Playlist Import**, as a label with an id and the playlist's name. The Jobs page shows one row per Playlist Import ("All Out 80s: 12 of 100") with **Cancel all**. The playlist itself is not kept, and the label goes when its Jobs are cleared.
- **The estimate is this install's own.** "About 2 hours" comes from the ratio of Separation time to Track duration over this install's recent succeeded Separations with the default Separation Model, applied to the sum of the ticked songs' Spotify durations. With no history it falls back to a constant: about 70 s per 4 minutes of audio, the CPU figure in the ROADMAP.
- **The checklist is a page**, `/import/playlist?url=…`, reached when the import field recognises a Spotify playlist or album link. A hundred rows need a page, and it survives a reload.
- **Localised from the start.** Every new string goes into both `i18n/locales/en.json` and `id.json`, with new terms added to `i18n/glossary.md`. Every new failure is a code in `shared/error-codes.ts` (ADR 0014).

## Out of scope

- Playlists over 100 songs, and any route past the embed page's limit
- "Log in with Spotify" (route (b)) and a self-hoster's own Client ID (route (c)). Recorded under Later as a fallback for one's own playlists over 100.
- A single Spotify song link
- Keeping or syncing a playlist after its import
- Deezer and SoundCloud (ROADMAP, Later)

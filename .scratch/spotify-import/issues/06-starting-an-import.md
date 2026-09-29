# 06: Starting a Playlist Import

**What to build:** `POST /api/playlist-imports` with `{ url, serviceIds: string[] }`. It creates the Tracks, and the import Job finds, downloads, and finishes each one.

**The route.** It reads the playlist again through `PlaylistReader`, rather than trusting songs sent from the browser, and keeps the chosen ids. It generates one Playlist Import id. Then, in one transaction, it goes song by song:

- Skip the song if its Song is already on a Track (ticket 01's lookup). This covers another import that raced this one, and skipped songs are returned as skipped.
- Otherwise, create a Track in `importing` with a YouTube Source and no link yet, Spotify's title as its title, its Song confirmed from Spotify's artist and title, and Spotify's duration.
- Enqueue an import Job labelled with the Playlist Import id and the playlist's name (ticket 03).

It returns the Playlist Import id, what was created, and what was skipped.

**The import Job** (`server/lib/jobs/import-track.ts`), for a YouTube Track with no link yet:

1. **Match.** Add `searchYoutube(query, signal)` to `SourceFetcher`, backed by yt-dlp `ytsearch10:"<artist> - <title>"` with metadata only. Take the first result within ±10 s of the Track's duration. Prefer an uploader ending in " - Topic", then results that aren't music videos (titles without "Official Video" or "Music Video"), then the rest in search order. Keep the ranking a plain function with its own tests. Store the chosen link as the Track's `source_ref`. A title the singer edited survives, as in `fetchFromSource` today.
2. **Download and normalise**, exactly as for any YouTube import.
3. **Lyrics.** Fetch them from the Track's Lyrics Provider for its confirmed Song. Search with a trailing ` - Remastered [year]`, ` - Remaster`, `(Radio Edit)`, ` - Single Version`, ` - Mono`, ` - Stereo`, or ` - [year] Mix` dropped from the title. The stored Song never changes. A Lyrics failure doesn't fail the import: the Track is ready without Lyrics, as when a lookup finds nothing today.
4. **Separation.** Queue one with the default Separation Model, carrying the same Playlist Import label. It runs on the heavy Lane (ticket 03).

The Spotify-derived fields a Track needs for this (at minimum its duration before download) live on the Track, not on a playlist row.

**Blocked by:** 03, 04

**Status:** done

- [x] The route creates one Track and one labelled import Job per chosen song, with the Song confirmed
- [x] A song whose Song is already on a Track is skipped, including when two imports race
- [x] Matching picks within ±10 s and prefers Topic, then non-video uploads (unit-tested ranking)
- [x] After the download, Lyrics are fetched with suffixes stripped from the search, and a Separation is queued with the label
- [x] A Lyrics failure leaves the Track ready
- [x] Cancelling a labelled import deletes its Track, as any cancelled import does, and frees its Song
- [x] Tests stub `SourceFetcher` and the Lyrics Provider. No network.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Implemented (2026-09-29).** A Track with no link yet has `source_ref = ''`, because the column is NOT NULL. Spotify's duration is stored in `duration_ms`. The import keeps Spotify's title rather than the video's. The follow-up (Lyrics, then Separation) runs in the import Job once the Track is ready. It tries the first of several artists alone when all of them together find nothing, keeps the provider's id and album art for the Song, and gives the provider 30 s. Known gap: after a retry, the Lyrics lookup uses YouTube's length rather than Spotify's.

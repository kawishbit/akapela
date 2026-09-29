# 02: `PlaylistReader` and the Spotify embed reader

**What to build:** The one seam through which Akapela reads a playlist from another service, and its Spotify implementation.

In `server/lib/playlists.ts` (or a `playlists/` directory, like `server/lyrics/`):

- `parsePlaylistLink(url)` recognises `open.spotify.com/playlist/<id>` and `open.spotify.com/album/<id>`, with or without `intl-xx/`, a query string, or the `spotify:playlist:<id>` / `spotify:album:<id>` URI form. It returns `{ service: 'spotify', kind: 'playlist' | 'album', id }` or null. Put it in `shared/`, so the import field (ticket 05) can use it in the browser too.
- `interface PlaylistReader { read(link, signal): Promise<Playlist> }`, where `Playlist` is `{ name, kind, total: number | null, songs: { serviceId, artist, title, durationMs }[] }`.
- `SpotifyEmbedReader`:
  - Fetches `https://open.spotify.com/embed/<kind>/<id>` and parses `__NEXT_DATA__` → `props.pageProps.state.data.entity`: `name`, then from `trackList[]` the `uri`, `title`, `subtitle` (as the artist string, verbatim), and `duration`.
  - Reads the total from `<meta name="music:song_count">` on `https://open.spotify.com/<kind>/<id>`, and treats a missing tag as `null`.
  - Skips songs with `isPlayable: false` rather than failing on them.

Refusals, each a new error code in `shared/error-codes.ts`:

- `playlistTooLong` (`total`): the total is over 100, or the total is unknown and the embed listed exactly 100
- `playlistNotFound`: 404, or a private or deleted playlist
- `playlistUnreadable`: the page came back but didn't have the expected shape. This is "Spotify changed its page", like `sourceFailed` for yt-dlp. Log the reason in English.

Test against saved HTML fixtures under `tests/fixtures/spotify/`: a playlist of 50, one of 150 (embed with 100 plus the meta tag), an album, and a page with no `__NEXT_DATA__`. Tests never hit the network. The reader takes an injectable `fetch` for this.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] `parsePlaylistLink` accepts the playlist and album link forms above and rejects track, artist, and non-Spotify links
- [ ] A 50-song fixture reads with its name, all songs, and the artist string verbatim
- [ ] A 150-song fixture is refused with `playlistTooLong` and `total: 150`
- [ ] An unknown total with exactly 100 listed is refused. An unknown total with 99 listed is read.
- [ ] An album fixture reads the same way
- [ ] A malformed page is `playlistUnreadable`, and a 404 is `playlistNotFound`
- [ ] New codes in `shared/error-codes.ts`, `en.json`, and `id.json`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

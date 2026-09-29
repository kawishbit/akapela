# 04: The preview route

**What to build:** `POST /api/playlist-imports/preview` with `{ url }`. It returns what the checklist needs, in one request.

```
{
  name, kind, total,
  songs: [{ serviceId, artist, title, durationMs,
            state: 'new' | 'inLibrary' | 'duplicate', trackId? }],
  separationMsPerAudioMs: number   // for the estimate; the page multiplies by the ticked durations
}
```

- A bad link is refused with a new code, `invalidPlaylistLink`. The reader's refusals from ticket 02 pass through with their codes.
- `inLibrary` uses ticket 01's lookup and carries the existing Track's id, so the page can link to it. `duplicate` is a song whose exact Song already appeared earlier in this playlist.
- The ratio comes from the last 10 succeeded Separations with the current default Separation Model: `(finishedAt - startedAt) / track.durationMs`, averaged. With none, use the fallback of 70 s per 240 s of audio. Keep this in a plain function with its own test.

**Blocked by:** 01, 02

**Status:** done

- [x] Returns name, kind, total, and songs with the right states, against a stubbed reader
- [x] A Song already on a Track is `inLibrary` with that Track's id
- [x] A repeated Song in the playlist is `duplicate` after its first appearance, and a remaster is not a duplicate of the original
- [x] The ratio uses only the default model's succeeded Separations, and falls back when there are none
- [x] Refusals pass through with their codes. `invalidPlaylistLink` is in `en.json` and `id.json`.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
